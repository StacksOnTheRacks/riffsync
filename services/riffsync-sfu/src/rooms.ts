import * as mediasoup from 'mediasoup';
import type { Producer, Router, RouterRtpCodecCapability, TransportListenInfo, WebRtcTransport } from 'mediasoup/types';
import { verifySfuJoinToken, type ProducerClass, type SfuJoinClaims } from './jwt.js';

export type { ProducerClass };

export const mediaCodecs: RouterRtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
    rtcpFeedback: [
      { type: 'nack' },
      { type: 'nack', parameter: 'pli' },
      { type: 'ccm', parameter: 'fir' },
      { type: 'goog-remb' },
    ],
  },
];

export type ProducerEntry = {
  producer: Producer;
  sessionId: string;
  producerClass: ProducerClass;
  kind: string;
};

export type ProducerSummary = {
  producerId: string;
  kind: string;
  sessionId: string;
  producerClass: ProducerClass;
};

export type RoomRuntime = {
  router: Router;
  producers: Map<string, ProducerEntry>;
  closeTimer: ReturnType<typeof setTimeout> | null;
};

const roomMap = new Map<string, RoomRuntime>();
let worker: mediasoup.types.Worker | null = null;

export async function getOrCreateWorker(): Promise<mediasoup.types.Worker> {
  if (worker && !worker.closed) return worker;
  const min = Number.parseInt(process.env.MEDIASOUP_RTC_MIN_PORT ?? '40000', 10);
  const max = Number.parseInt(process.env.MEDIASOUP_RTC_MAX_PORT ?? '40199', 10);
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: Number.isFinite(min) ? min : 40_000,
    rtcMaxPort: Number.isFinite(max) ? max : 40_199,
  });
  worker.on('died', () => {
    worker = null;
    for (const [, r] of roomMap) {
      r.router.close();
    }
    roomMap.clear();
  });
  return worker;
}

const ROOM_IDLE_MS = 30 * 60 * 1000;

function scheduleRoomClose(roomKey: string): void {
  const rt = roomMap.get(roomKey);
  if (!rt || rt.closeTimer) return;
  rt.closeTimer = setTimeout(() => {
    const cur = roomMap.get(roomKey);
    if (!cur) return;
    cur.closeTimer = null;
    if (cur.producers.size === 0) {
      cur.router.close();
      roomMap.delete(roomKey);
    }
  }, ROOM_IDLE_MS);
}

function cancelRoomClose(roomKey: string): void {
  const rt = roomMap.get(roomKey);
  if (!rt?.closeTimer) return;
  clearTimeout(rt.closeTimer);
  rt.closeTimer = null;
}

export async function getOrCreateRoom(roomKey: string): Promise<RoomRuntime> {
  let rt = roomMap.get(roomKey);
  if (rt) {
    cancelRoomClose(roomKey);
    return rt;
  }
  const w = await getOrCreateWorker();
  const router = await w.createRouter({ mediaCodecs });
  rt = { router, producers: new Map(), closeTimer: null };
  roomMap.set(roomKey, rt);
  return rt;
}

export function transportListenIps(): TransportListenInfo[] {
  const announced = process.env.MEDIASOUP_ANNOUNCED_IP?.trim();
  const ann = announced && announced !== '' ? { announcedAddress: announced } : {};
  return [
    { protocol: 'udp', ip: '0.0.0.0', ...ann },
    { protocol: 'tcp', ip: '0.0.0.0', ...ann },
  ];
}

export function roomKeyFromClaims(c: SfuJoinClaims): string {
  return `${c.env}:${c.roomId}`;
}

function findProducerIdForTuple(
  rt: RoomRuntime,
  sessionId: string,
  producerClass: ProducerClass,
  kind: string,
): string | undefined {
  for (const [producerId, entry] of rt.producers) {
    if (entry.sessionId === sessionId && entry.producerClass === producerClass && entry.kind === kind) {
      return producerId;
    }
  }
  return undefined;
}

export function upsertProducer(
  roomKey: string,
  sessionId: string,
  producerClass: ProducerClass,
  kind: string,
  producer: Producer,
): void {
  const rt = roomMap.get(roomKey);
  if (!rt) return;
  const prevId = findProducerIdForTuple(rt, sessionId, producerClass, kind);
  if (prevId) {
    const prev = rt.producers.get(prevId);
    if (prev && prev.producer.id !== producer.id) {
      prev.producer.close();
    }
    rt.producers.delete(prevId);
  }
  rt.producers.set(producer.id, { producer, sessionId, producerClass, kind });
}

/** @returns true if a producer row was removed (first removal wins if both transportclose and @close fire). */
export function removeProducer(roomKey: string, producerId: string): boolean {
  const rt = roomMap.get(roomKey);
  if (!rt) return false;
  const removed = rt.producers.delete(producerId);
  if (removed && rt.producers.size === 0) {
    scheduleRoomClose(roomKey);
  }
  return removed;
}

export function removeProducersForSession(roomKey: string, sessionId: string): ProducerSummary[] {
  const rt = roomMap.get(roomKey);
  if (!rt) return [];
  const removed: ProducerSummary[] = [];
  for (const [producerId, entry] of rt.producers) {
    if (entry.sessionId !== sessionId) continue;
    void entry.producer.close();
    rt.producers.delete(producerId);
    removed.push({
      producerId,
      kind: entry.kind,
      sessionId: entry.sessionId,
      producerClass: entry.producerClass,
    });
  }
  if (removed.length > 0 && rt.producers.size === 0) {
    scheduleRoomClose(roomKey);
  }
  return removed;
}

/** Closes every producer in the room matching producerClass (idempotent when none exist). */
export function removeProducersByProducerClass(
  roomKey: string,
  producerClass: ProducerClass,
): ProducerSummary[] {
  const rt = roomMap.get(roomKey);
  if (!rt) return [];
  const removed: ProducerSummary[] = [];
  for (const [producerId, entry] of rt.producers) {
    if (entry.producerClass !== producerClass) continue;
    void entry.producer.close();
    rt.producers.delete(producerId);
    removed.push({
      producerId,
      kind: entry.kind,
      sessionId: entry.sessionId,
      producerClass: entry.producerClass,
    });
  }
  if (removed.length > 0 && rt.producers.size === 0) {
    scheduleRoomClose(roomKey);
  }
  return removed;
}

export function countProducersForSession(roomKey: string, sessionId: string): number {
  const rt = roomMap.get(roomKey);
  if (!rt) return 0;
  let count = 0;
  for (const entry of rt.producers.values()) {
    if (entry.sessionId === sessionId) count += 1;
  }
  return count;
}

export function countProducersInRoom(roomKey: string): number {
  return roomMap.get(roomKey)?.producers.size ?? 0;
}

export function hasProducerForTuple(
  roomKey: string,
  sessionId: string,
  producerClass: ProducerClass,
  kind: string,
): boolean {
  const rt = roomMap.get(roomKey);
  if (!rt) return false;
  return findProducerIdForTuple(rt, sessionId, producerClass, kind) !== undefined;
}

export function getProducerEntry(roomKey: string, producerId: string): ProducerEntry | undefined {
  return roomMap.get(roomKey)?.producers.get(producerId);
}

export function getMediasoupHealthSnapshot(): { workerAlive: boolean; roomCount: number } {
  return {
    workerAlive: Boolean(worker && !worker.closed),
    roomCount: roomMap.size,
  };
}

export async function shutdownMediasoup(): Promise<void> {
  for (const [, rt] of roomMap) {
    if (rt.closeTimer) {
      clearTimeout(rt.closeTimer);
      rt.closeTimer = null;
    }
    rt.router.close();
  }
  roomMap.clear();
  const w = worker;
  worker = null;
  if (w && !w.closed) {
    w.close();
  }
}

export function listProducerSummaries(roomKey: string): ProducerSummary[] {
  const rt = roomMap.get(roomKey);
  if (!rt) return [];
  const out: ProducerSummary[] = [];
  for (const [producerId, entry] of rt.producers) {
    out.push({
      producerId,
      kind: entry.kind,
      sessionId: entry.sessionId,
      producerClass: entry.producerClass,
    });
  }
  return out;
}

export type SignalingSession = {
  claims: SfuJoinClaims;
  roomKey: string;
  transports: Map<string, WebRtcTransport>;
  notify: (o: Record<string, unknown>) => void;
};

export function attachTransportHandlers(
  transport: WebRtcTransport,
  sess: SignalingSession,
  onProducerClose?: (producerId: string) => void,
): void {
  transport.on('dtlsstatechange', (dtlsState: string) => {
    if (dtlsState === 'closed') {
      void transport.close();
    }
  });
  transport.on('@close', () => {
    sess.transports.delete(transport.id);
  });
  transport.on('@producerclose', () => {
    /* consumer transport */
  });
}

export async function closeSessionTransports(sess: SignalingSession): Promise<void> {
  for (const t of sess.transports.values()) {
    void t.close();
  }
  sess.transports.clear();
}

export { verifySfuJoinToken };
