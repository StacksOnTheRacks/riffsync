import * as mediasoup from 'mediasoup';
import { verifySfuJoinToken } from './jwt.js';
export const mediaCodecs = [
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
const roomMap = new Map();
let worker = null;
export async function getOrCreateWorker() {
    if (worker && !worker.closed)
        return worker;
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
function scheduleRoomClose(roomKey) {
    const rt = roomMap.get(roomKey);
    if (!rt || rt.closeTimer)
        return;
    rt.closeTimer = setTimeout(() => {
        const cur = roomMap.get(roomKey);
        if (!cur)
            return;
        cur.closeTimer = null;
        if (cur.producersByKind.size === 0) {
            cur.router.close();
            roomMap.delete(roomKey);
        }
    }, ROOM_IDLE_MS);
}
function cancelRoomClose(roomKey) {
    const rt = roomMap.get(roomKey);
    if (!rt?.closeTimer)
        return;
    clearTimeout(rt.closeTimer);
    rt.closeTimer = null;
}
export async function getOrCreateRoom(roomKey) {
    let rt = roomMap.get(roomKey);
    if (rt) {
        cancelRoomClose(roomKey);
        return rt;
    }
    const w = await getOrCreateWorker();
    const router = await w.createRouter({ mediaCodecs });
    rt = { router, producersByKind: new Map(), closeTimer: null };
    roomMap.set(roomKey, rt);
    return rt;
}
export function transportListenIps() {
    const announced = process.env.MEDIASOUP_ANNOUNCED_IP?.trim();
    const ann = announced && announced !== '' ? { announcedAddress: announced } : {};
    return [
        { protocol: 'udp', ip: '0.0.0.0', ...ann },
        { protocol: 'tcp', ip: '0.0.0.0', ...ann },
    ];
}
export function roomKeyFromClaims(c) {
    return `${c.env}:${c.roomId}`;
}
export function upsertProducer(roomKey, kind, producer) {
    const rt = roomMap.get(roomKey);
    if (!rt)
        return;
    const prev = rt.producersByKind.get(kind);
    if (prev && prev.id !== producer.id) {
        prev.close();
    }
    rt.producersByKind.set(kind, producer);
}
export function removeProducer(roomKey, producerId) {
    const rt = roomMap.get(roomKey);
    if (!rt)
        return;
    for (const [kind, p] of rt.producersByKind) {
        if (p.id === producerId) {
            rt.producersByKind.delete(kind);
            break;
        }
    }
    if (rt.producersByKind.size === 0) {
        scheduleRoomClose(roomKey);
    }
}
export function listProducerSummaries(roomKey) {
    const rt = roomMap.get(roomKey);
    if (!rt)
        return [];
    const out = [];
    for (const [, p] of rt.producersByKind) {
        out.push({ producerId: p.id, kind: p.kind });
    }
    return out;
}
export function attachTransportHandlers(transport, sess, onProducerClose) {
    transport.on('dtlsstatechange', (dtlsState) => {
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
export async function closeSessionTransports(sess) {
    for (const t of sess.transports.values()) {
        void t.close();
    }
    sess.transports.clear();
}
export { verifySfuJoinToken };
