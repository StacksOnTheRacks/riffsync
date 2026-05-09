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
  getOrCreateRoom,
  listProducerSummaries,
  removeProducer,
  roomKeyFromClaims,
  transportListenIps,
  upsertProducer,
  verifySfuJoinToken,
  type RoomRuntime,
} from './rooms.js';
import type { SfuJoinClaims } from './jwt.js';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const JWT_SECRET = process.env.SFU_JWT_SECRET?.trim() ?? '';

type RoomSubscriber = { sessionId: string; ws: WebSocket };
const subscribersByRoom = new Map<string, Set<RoomSubscriber>>();

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
    console.error('SFU_JWT_SECRET is required');
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
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
    console.info(`riffsync-sfu listening on ${PORT} health=http://localhost:${PORT}/health`);
  });
}

async function handleConnection(ws: WebSocket, claims: SfuJoinClaims): Promise<void> {
  const roomKey = roomKeyFromClaims(claims);
  const room = await getOrCreateRoom(roomKey);
  const transports = new Map<string, WebRtcTransport>();
  const consumers = new Map<string, Consumer>();
  const pending: PendingSession = { claims, roomKey, room, transports, consumers };

  registerSubscriber(roomKey, claims.sessionId, ws);

  ws.on('message', (raw) => {
    void onMessage(ws, pending, raw.toString());
  });
  ws.on('close', () => {
    unregisterSubscriber(roomKey, claims.sessionId, ws);
    void tearDownSession(pending);
  });
  ws.on('error', () => {
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
    for (const [, prod] of [...p.room.producersByKind]) {
      void prod.close();
    }
    p.room.producersByKind.clear();
  }
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
  const method = typeof msg.method === 'string' ? msg.method : '';
  const data =
    msg.data !== undefined && typeof msg.data === 'object' && msg.data !== null
      ? (msg.data as Record<string, unknown>)
      : {};

  try {
    switch (method) {
      case 'getRouterRtpCapabilities':
        send(ws, { type: 'response', id, data: { routerRtpCapabilities: p.room.router.rtpCapabilities } });
        break;

      case 'createWebRtcTransport': {
        const asProducer = Boolean(data.producer);
        const asConsumer = Boolean(data.consumer);
        if (p.claims.role === 'producer' && !asProducer) {
          send(ws, errResponse(id, 'host transport must set producer: true'));
          return;
        }
        if (p.claims.role === 'consumer' && !asConsumer) {
          send(ws, errResponse(id, 'guest transport must set consumer: true'));
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
          send(ws, errResponse(id, 'forbidden'));
          return;
        }
        const transportId = typeof data.transportId === 'string' ? data.transportId : '';
        const kind = data.kind === 'audio' || data.kind === 'video' ? data.kind : null;
        const rtpParameters = data.rtpParameters;
        const transport = p.transports.get(transportId);
        if (!transport || !kind || typeof rtpParameters !== 'object' || rtpParameters === null) {
          send(ws, errResponse(id, 'bad produce params'));
          return;
        }
        const producer = await transport.produce({
          kind,
          rtpParameters: rtpParameters as RtpParameters,
          appData: { sessionId: p.claims.sessionId },
        });
        upsertProducer(p.roomKey, kind, producer);
        producer.on('transportclose', () => {
          if (removeProducer(p.roomKey, producer.id)) {
            broadcast(p.roomKey, p.claims.sessionId, {
              type: 'event',
              name: 'producerClosed',
              data: { producerId: producer.id },
            });
          }
        });
        producer.on('@close', () => {
          if (removeProducer(p.roomKey, producer.id)) {
            broadcast(p.roomKey, p.claims.sessionId, {
              type: 'event',
              name: 'producerClosed',
              data: { producerId: producer.id },
            });
          }
        });
        broadcast(p.roomKey, p.claims.sessionId, {
          type: 'event',
          name: 'newProducer',
          data: { producerId: producer.id, kind: producer.kind },
        });
        send(ws, { type: 'response', id, data: { producerId: producer.id, kind: producer.kind } });
        break;
      }

      case 'consume': {
        if (p.claims.role !== 'consumer') {
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
        const producerFound = [...p.room.producersByKind.values()].find((pr) => pr.id === producerId);
        if (!producerFound) {
          send(ws, errResponse(id, 'producer gone'));
          return;
        }
        if (!p.room.router.canConsume({ producerId, rtpCapabilities: caps })) {
          send(ws, errResponse(id, 'cannot consume'));
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
    send(ws, errResponse(id, m));
  }
}

run();
