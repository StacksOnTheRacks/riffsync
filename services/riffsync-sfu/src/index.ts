import { timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import process from 'node:process';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type {
  Consumer,
  DtlsParameters,
  RtpCapabilities,
  RtpParameters,
  WebRtcTransport,
} from 'mediasoup/types';
import {
  attachTransportHandlers,
  closeSessionTransports,
  countProducersForSession,
  countProducersInRoom,
  getOrCreateRoom,
  getMediasoupHealthSnapshot,
  getProducerEntry,
  hasProducerForTuple,
  listProducerSummaries,
  removeProducer,
  removeProducersByProducerClass,
  removeProducersForSession,
  roomKeyFromClaims,
  shutdownMediasoup,
  maybeCloseIdleRoom,
  transportListenIps,
  upsertProducer,
  verifySfuJoinToken,
  type ProducerSummary,
  type RoomRuntime,
} from './rooms.js';
import {
  isProducerClass,
  isProducerClassAllowed,
  type ProducerClass,
  type SfuJoinClaims,
} from './jwt.js';
import { emitMediaLimitRejected, emitProduceFailure } from './media-observability.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const JWT_SECRET = process.env.SFU_JWT_SECRET?.trim() ?? '';
const SFU_ADMIN_SECRET = process.env.SFU_ADMIN_SECRET?.trim() ?? '';
const SFU_ADMIN_SECRET_HEADER = 'x-sfu-admin-secret';
const MAX_TRANSPORTS = Math.max(1, Number.parseInt(process.env.SFU_MAX_WEBRTC_TRANSPORTS_PER_SESSION ?? '8', 10));
const MAX_CONSUMERS = Math.max(1, Number.parseInt(process.env.SFU_MAX_CONSUMERS_PER_SESSION ?? '64', 10));
const MAX_PRODUCERS_PER_SESSION = Math.max(
  1,
  Number.parseInt(process.env.SFU_MAX_PRODUCERS_PER_SESSION ?? '4', 10),
);
const MAX_PRODUCERS_PER_ROOM = Math.max(1, Number.parseInt(process.env.SFU_MAX_PRODUCERS_PER_ROOM ?? '24', 10));

function logJson(
  level: 'info' | 'warn' | 'error',
  msg: string,
  fields: Record<string, unknown> | undefined,
): void {
  const row: Record<string, unknown> = { ts: new Date().toISOString(), level, msg, ...fields };
  if (level === 'error') {
    console.error(JSON.stringify(row));
    return;
  }
  console.log(JSON.stringify(row));
}

type RoomSubscriber = { sessionId: string; ws: WebSocket };
const subscribersByRoom = new Map<string, Set<RoomSubscriber>>();
const liveSockets = new Set<WebSocket>();
let acceptingUpgrades = true;

function subscribersFor(roomKey: string): Set<RoomSubscriber> {
  let s = subscribersByRoom.get(roomKey);
  if (!s) {
    s = new Set();
    subscribersByRoom.set(roomKey, s);
  }
  return s;
}

function registerSubscriber(roomKey: string, sessionId: string, ws: WebSocket): void {
  subscribersFor(roomKey).add({ sessionId, ws });
}

function unregisterSubscriber(roomKey: string, sessionId: string, ws: WebSocket): void {
  const s = subscribersByRoom.get(roomKey);
  if (!s) return;
  for (const ent of s) {
    if (ent.sessionId === sessionId && ent.ws === ws) {
      s.delete(ent);
      break;
    }
  }
  if (s.size === 0) {
    subscribersByRoom.delete(roomKey);
    maybeCloseIdleRoom(roomKey);
  }
}

function broadcast(roomKey: string, exceptSessionId: string, o: Record<string, unknown>): void {
  const msg = JSON.stringify(o);
  for (const { sessionId, ws } of subscribersFor(roomKey)) {
    if (sessionId === exceptSessionId || ws.readyState !== ws.OPEN) continue;
    ws.send(msg);
  }
}

function readTokenFromUrl(url: string): string | null {
  try {
    const u = new URL(url, 'http://localhost');
    return u.searchParams.get('token');
  } catch {
    return null;
  }
}

function send(ws: WebSocket, o: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(o));
  }
}

function adminSecretMatches(req: http.IncomingMessage): boolean {
  if (!SFU_ADMIN_SECRET) return false;
  const raw = req.headers[SFU_ADMIN_SECRET_HEADER];
  const provided = typeof raw === 'string' ? raw.trim() : '';
  if (!provided) return false;
  const expected = Buffer.from(SFU_ADMIN_SECRET, 'utf8');
  const got = Buffer.from(provided, 'utf8');
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

async function handleAdminTeardownProducers(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  if (!adminSecretMatches(req)) {
    res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req)) as Record<string, unknown>;
  } catch {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'invalid_json' }));
    return;
  }

  const env = typeof body.env === 'string' ? body.env.trim() : '';
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  if (!env || !roomId) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'env and roomId required' }));
    return;
  }

  const producerClassRaw = body.producerClass;
  if (
    producerClassRaw !== undefined &&
    producerClassRaw !== null &&
    producerClassRaw !== 'participant_av'
  ) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'producerClass must be participant_av or omitted' }));
    return;
  }
  const producerClass: ProducerClass = 'participant_av';

  const roomKey = `${env}:${roomId}`;
  const removed = removeProducersByProducerClass(roomKey, producerClass);
  for (const summary of removed) {
    broadcast(roomKey, summary.sessionId, producerClosedEvent(summary));
  }

  logJson('info', 'sfu_admin_teardown_producers', {
    roomKey,
    producerClass,
    closedCount: removed.length,
  });

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, closedCount: removed.length, roomKey, producerClass }));
}

function errResponse(id: number | undefined, message: string): Record<string, unknown> {
  return { type: 'error', id, error: message };
}

type PendingSession = {
  claims: SfuJoinClaims;
  roomKey: string;
  room: RoomRuntime;
  transports: Map<string, WebRtcTransport>;
  consumers: Map<string, Consumer>;
};

function run(): void {
  if (!JWT_SECRET) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'SFU_JWT_SECRET is required' }));
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const urlPath = (() => {
      try {
        return new URL(req.url ?? '/', 'http://localhost').pathname;
      } catch {
        return req.url ?? '/';
      }
    })();

    if (urlPath === '/health' || urlPath === '/healthz') {
      if (urlPath === '/healthz') {
        const snap = getMediasoupHealthSnapshot();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: true,
            workerAlive: snap.workerAlive,
            routerRoomCount: snap.roomCount,
            signalingConnections: liveSockets.size,
          }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    if (req.method === 'POST' && urlPath === '/admin/teardown-producers') {
      void handleAdminTeardownProducers(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!acceptingUpgrades) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }
    const host = req.headers.host ?? 'localhost';
    const token = readTokenFromUrl(`http://${host}${req.url ?? ''}`);
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const claims = verifySfuJoinToken(token, JWT_SECRET);
    if (!claims) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleConnection(ws, claims);
    });
  });

  server.listen(PORT, () => {
    logJson('info', 'riffsync_sfu_listen', {
      port: PORT,
      maxTransports: MAX_TRANSPORTS,
      maxConsumers: MAX_CONSUMERS,
      maxProducersPerSession: MAX_PRODUCERS_PER_SESSION,
      maxProducersPerRoom: MAX_PRODUCERS_PER_ROOM,
    });
  });

  const shutdown = (sig: string) => {
    logJson('info', 'riffsync_sfu_shutdown_start', { signal: sig });
    acceptingUpgrades = false;
    for (const s of liveSockets) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    void shutdownMediasoup()
      .catch(() => undefined)
      .finally(() => {
        server.close(() => {
          logJson('info', 'riffsync_sfu_shutdown_done', { signal: sig });
          process.exit(0);
        });
      });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

async function handleConnection(ws: WebSocket, claims: SfuJoinClaims): Promise<void> {
  const roomKey = roomKeyFromClaims(claims);
  const room = await getOrCreateRoom(roomKey);
  const transports = new Map<string, WebRtcTransport>();
  const consumers = new Map<string, Consumer>();
  const pending: PendingSession = { claims, roomKey, room, transports, consumers };

  registerSubscriber(roomKey, claims.sessionId, ws);
  liveSockets.add(ws);

  ws.on('message', (raw) => {
    void onMessage(ws, pending, raw.toString());
  });
  ws.on('close', () => {
    liveSockets.delete(ws);
    logJson('info', 'sfu_socket_close', { roomKey, sessionId: claims.sessionId });
    unregisterSubscriber(roomKey, claims.sessionId, ws);
    void tearDownSession(pending);
  });
  ws.on('error', () => {
    liveSockets.delete(ws);
    unregisterSubscriber(roomKey, claims.sessionId, ws);
    void tearDownSession(pending);
  });

  send(ws, { type: 'ready', roomKey, role: claims.role });
}

async function tearDownSession(p: PendingSession): Promise<void> {
  for (const c of p.consumers.values()) {
    void c.close();
  }
  p.consumers.clear();
  await closeSessionTransports({
    claims: p.claims,
    roomKey: p.roomKey,
    transports: p.transports,
    notify: () => {
      /* closed */
    },
  });

  if (p.claims.role === 'producer') {
    const removed = removeProducersForSession(p.roomKey, p.claims.sessionId);
    for (const summary of removed) {
      broadcast(p.roomKey, p.claims.sessionId, producerClosedEvent(summary));
    }
  }
}

function producerClosedEvent(summary: Pick<ProducerSummary, 'producerId' | 'kind' | 'sessionId' | 'producerClass'>) {
  return {
    type: 'event' as const,
    name: 'producerClosed',
    data: {
      producerId: summary.producerId,
      kind: summary.kind,
      sessionId: summary.sessionId,
      producerClass: summary.producerClass,
    },
  };
}

function newProducerEvent(summary: Pick<ProducerSummary, 'producerId' | 'kind' | 'sessionId' | 'producerClass'>) {
  return {
    type: 'event' as const,
    name: 'newProducer',
    data: {
      producerId: summary.producerId,
      kind: summary.kind,
      sessionId: summary.sessionId,
      producerClass: summary.producerClass,
    },
  };
}

async function onMessage(ws: WebSocket, p: PendingSession, raw: string): Promise<void> {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    send(ws, errResponse(undefined, 'invalid_json'));
    return;
  }
  if (msg.type !== 'request') {
    send(ws, errResponse(undefined, 'expected request'));
    return;
  }
  const id = typeof msg.id === 'number' ? msg.id : undefined;
  const requestId = typeof msg.requestId === 'string' ? msg.requestId : undefined;
  const method = typeof msg.method === 'string' ? msg.method : '';
  const data =
    msg.data !== undefined && typeof msg.data === 'object' && msg.data !== null
      ? (msg.data as Record<string, unknown>)
      : {};

  logJson('info', 'sfu_request', {
    roomKey: p.roomKey,
    sessionId: p.claims.sessionId,
    method,
    requestId,
    id,
  });

  try {
    switch (method) {
      case 'getRouterRtpCapabilities':
        send(ws, { type: 'response', id, data: { routerRtpCapabilities: p.room.router.rtpCapabilities } });
        break;

      case 'createWebRtcTransport': {
        const asProducer = Boolean(data.producer);
        const asConsumer = Boolean(data.consumer);
        if (p.claims.role === 'consumer' && !asConsumer) {
          send(ws, errResponse(id, 'guest transport must set consumer: true'));
          return;
        }
        if (p.claims.role === 'producer' && !asProducer && !asConsumer) {
          send(ws, errResponse(id, 'producer transport must set producer and/or consumer'));
          return;
        }
        if (p.transports.size >= MAX_TRANSPORTS) {
          logJson('warn', 'transport limit reached', { signal: 'TransportLimitRejected' });
          emitMediaLimitRejected('TransportLimitRejected');
          send(ws, errResponse(id, 'transport limit reached'));
          return;
        }
        const transport = await p.room.router.createWebRtcTransport({
          listenInfos: transportListenIps(),
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          appData: { sessionId: p.claims.sessionId },
        });
        p.transports.set(transport.id, transport);
        attachTransportHandlers(transport, {
          claims: p.claims,
          roomKey: p.roomKey,
          transports: p.transports,
          notify: (o) => send(ws, o),
        });
        transport.on('routerclose', () => {
          p.transports.delete(transport.id);
        });
        send(ws, {
          type: 'response',
          id,
          data: {
            transportId: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
            sctpParameters: transport.sctpParameters,
          },
        });
        break;
      }

      case 'listProducers': {
        send(ws, {
          type: 'response',
          id,
          data: { producers: listProducerSummaries(p.roomKey) },
        });
        break;
      }

      case 'connectWebRtcTransport': {
        const transportId = typeof data.transportId === 'string' ? data.transportId : '';
        const dtlsParameters = data.dtlsParameters;
        const transport = p.transports.get(transportId);
        if (!transport || typeof dtlsParameters !== 'object' || dtlsParameters === null) {
          send(ws, errResponse(id, 'bad transport or dtlsParameters'));
          return;
        }
        await transport.connect({ dtlsParameters: dtlsParameters as DtlsParameters });
        send(ws, { type: 'response', id, data: {} });
        break;
      }

      case 'produce': {
        if (p.claims.role !== 'producer') {
          emitProduceFailure('forbidden');
          send(ws, errResponse(id, 'forbidden'));
          return;
        }
        const transportId = typeof data.transportId === 'string' ? data.transportId : '';
        const kind = data.kind === 'audio' || data.kind === 'video' ? data.kind : null;
        const producerClassRaw = data.producerClass;
        const producerClass: ProducerClass | null = isProducerClass(producerClassRaw) ? producerClassRaw : null;
        const rtpParameters = data.rtpParameters;
        const transport = p.transports.get(transportId);
        if (!transport || !kind || !producerClass || typeof rtpParameters !== 'object' || rtpParameters === null) {
          emitProduceFailure('bad_params');
          send(ws, errResponse(id, 'bad produce params'));
          return;
        }
        if (!isProducerClassAllowed(p.claims, producerClass)) {
          emitProduceFailure('producer_class_mismatch');
          send(ws, errResponse(id, 'producer_class_mismatch'));
          return;
        }
        const replacing = hasProducerForTuple(p.roomKey, p.claims.sessionId, producerClass, kind);
        if (!replacing && countProducersForSession(p.roomKey, p.claims.sessionId) >= MAX_PRODUCERS_PER_SESSION) {
          emitProduceFailure('session_producer_limit');
          send(ws, errResponse(id, 'session producer limit reached'));
          return;
        }
        if (!replacing && countProducersInRoom(p.roomKey) >= MAX_PRODUCERS_PER_ROOM) {
          emitProduceFailure('room_producer_limit');
          send(ws, errResponse(id, 'room producer limit reached'));
          return;
        }
        const producer = await transport.produce({
          kind,
          rtpParameters: rtpParameters as RtpParameters,
          appData: { sessionId: p.claims.sessionId, producerClass },
        });
        upsertProducer(p.roomKey, p.claims.sessionId, producerClass, kind, producer);
        const summary: ProducerSummary = {
          producerId: producer.id,
          kind: producer.kind,
          sessionId: p.claims.sessionId,
          producerClass,
        };
        producer.on('transportclose', () => {
          if (removeProducer(p.roomKey, producer.id)) {
            broadcast(p.roomKey, p.claims.sessionId, producerClosedEvent(summary));
          }
        });
        producer.on('@close', () => {
          if (removeProducer(p.roomKey, producer.id)) {
            broadcast(p.roomKey, p.claims.sessionId, producerClosedEvent(summary));
          }
        });
        broadcast(p.roomKey, p.claims.sessionId, newProducerEvent(summary));
        send(ws, {
          type: 'response',
          id,
          data: {
            producerId: producer.id,
            kind: producer.kind,
            sessionId: p.claims.sessionId,
            producerClass,
          },
        });
        break;
      }

      case 'closeProducer': {
        if (p.claims.role !== 'producer') {
          send(ws, errResponse(id, 'forbidden'));
          return;
        }
        const producerId = typeof data.producerId === 'string' ? data.producerId : '';
        if (!producerId) {
          send(ws, errResponse(id, 'bad closeProducer params'));
          return;
        }
        const entry = getProducerEntry(p.roomKey, producerId);
        if (!entry) {
          send(ws, { type: 'response', id, data: { ok: true, alreadyClosed: true } });
          return;
        }
        if (entry.sessionId !== p.claims.sessionId) {
          send(ws, errResponse(id, 'forbidden'));
          return;
        }
        entry.producer.close();
        send(ws, { type: 'response', id, data: { ok: true } });
        break;
      }

      case 'consume': {
        if (p.claims.role !== 'consumer' && p.claims.role !== 'producer') {
          send(ws, errResponse(id, 'forbidden'));
          return;
        }
        const transportId = typeof data.transportId === 'string' ? data.transportId : '';
        const producerId = typeof data.producerId === 'string' ? data.producerId : '';
        const rtpCapabilities = data.rtpCapabilities;
        const transport = p.transports.get(transportId);
        if (!transport || !producerId || typeof rtpCapabilities !== 'object' || rtpCapabilities === null) {
          send(ws, errResponse(id, 'bad consume params'));
          return;
        }
        const caps = rtpCapabilities as RtpCapabilities;
        const producerFound = getProducerEntry(p.roomKey, producerId);
        if (!producerFound) {
          send(ws, errResponse(id, 'producer gone'));
          return;
        }
        if (!p.room.router.canConsume({ producerId, rtpCapabilities: caps })) {
          send(ws, errResponse(id, 'cannot consume'));
          return;
        }
        if (p.consumers.size >= MAX_CONSUMERS) {
          logJson('warn', 'consumer limit reached', { signal: 'ConsumerLimitRejected' });
          emitMediaLimitRejected('ConsumerLimitRejected');
          send(ws, errResponse(id, 'consumer limit reached'));
          return;
        }
        const consumer = await transport.consume({
          producerId,
          rtpCapabilities: caps,
          paused: false,
        });
        p.consumers.set(consumer.id, consumer);
        consumer.on('transportclose', () => {
          p.consumers.delete(consumer.id);
        });
        send(ws, {
          type: 'response',
          id,
          data: {
            consumerId: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          },
        });
        break;
      }
      default:
        send(ws, errResponse(id, `unknown method ${method}`));
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    logJson('error', 'sfu_request_failed', {
      roomKey: p.roomKey,
      sessionId: p.claims.sessionId,
      error: m,
    });
    send(ws, errResponse(id, m));
  }
}

run();
