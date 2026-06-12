import * as mediasoupClient from 'mediasoup-client'
import type {
  Consumer,
  Device,
  Producer,
  Transport,
} from 'mediasoup-client/types'
import WebSocket from 'ws'
import { HARNESS_ENV, HARNESS_ROOM_ID } from './harness-constants.js'
import { loadHarnessEnv } from './harness-env.js'
import { failHarness } from './harness-failure.js'
import { createSyntheticAvStream, registerWebrtcGlobals } from './register-webrtc-globals.js'
import { signSfuJoinToken, type SfuProducerClass } from './sign-join-token.js'

registerWebrtcGlobals()

type Pending = {
  resolve: (v: Record<string, unknown>) => void
  reject: (e: Error) => void
}

export class HarnessSfuSignaling {
  private ws: WebSocket
  private nextId = 0
  private pending = new Map<number, Pending>()
  private eventHandler: ((name: string, data: Record<string, unknown>) => void) | null = null

  constructor(urlWithToken: string) {
    this.ws = new WebSocket(urlWithToken)
    this.ws.on('message', (raw) => {
      void this.handleMessage(String(raw))
    })
  }

  set onEvent(cb: (name: string, data: Record<string, unknown>) => void) {
    this.eventHandler = cb
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN
  }

  close(): void {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve())
      this.ws.once('error', () => reject(new Error('SFU WebSocket failed to open')))
    })
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    if (msg.type === 'event' && typeof msg.name === 'string' && isRecord(msg.data)) {
      this.eventHandler?.(msg.name, msg.data as Record<string, unknown>)
      return
    }
    if (msg.type === 'error') {
      const id = typeof msg.id === 'number' ? msg.id : undefined
      const err = typeof msg.error === 'string' ? msg.error : 'sfu error'
      const p = id !== undefined ? this.pending.get(id) : undefined
      if (p) {
        this.pending.delete(id!)
        p.reject(new Error(err))
      }
      return
    }
    if (msg.type === 'response') {
      const id = typeof msg.id === 'number' ? msg.id : undefined
      if (id === undefined) return
      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)
      const data = isRecord(msg.data) ? (msg.data as Record<string, unknown>) : {}
      p.resolve(data)
    }
  }

  request(method: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('SFU WebSocket not open'))
        return
      }
      const id = ++this.nextId
      this.pending.set(id, { resolve, reject })
      this.ws.send(
        JSON.stringify({
          type: 'request',
          id,
          requestId: `${Date.now().toString(36)}-${id}`,
          method,
          data,
        }),
      )
    })
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function signalingUrl(base: string, token: string): string {
  const u = new URL(base)
  u.searchParams.set('token', token)
  return u.toString()
}

function mintToken(
  secret: string,
  role: 'producer' | 'consumer',
  sessionId: string,
  producerClass?: SfuProducerClass,
): string {
  const now = Math.floor(Date.now() / 1000)
  return signSfuJoinToken(
    {
      env: HARNESS_ENV,
      roomId: HARNESS_ROOM_ID,
      sessionId,
      role,
      ...(producerClass ? { producerClass } : {}),
      ...(role === 'producer' && producerClass === 'participant_av'
        ? { fanSub: 'harness-fan-sub' }
        : {}),
      iat: now,
      exp: now + 900,
    },
    secret,
  )
}

export type HarnessPeerSession = {
  signaling: HarnessSfuSignaling
  device: Device
  sendTransport: Transport | null
  recvTransport: Transport | null
  producers: Producer[]
  consumers: Consumer[]
  close: () => void
}

async function setupPeer(
  role: 'producer' | 'consumer',
  sessionId: string,
  producerClass: SfuProducerClass | undefined,
  step: string,
): Promise<HarnessPeerSession> {
  const env = loadHarnessEnv()
  const token = mintToken(env.sfuJwtSecret, role, sessionId, producerClass)
  const signaling = new HarnessSfuSignaling(signalingUrl(env.sfuWsBase, token))

  try {
    await signaling.connect()
  } catch (e) {
    failHarness(
      'connectivity',
      'SIGNALING_CONNECT_FAILED',
      step,
      e instanceof Error ? e.message : String(e),
    )
  }

  let routerRtpCapabilities: Record<string, unknown>
  try {
    const capsRes = await signaling.request('getRouterRtpCapabilities')
    if (!isRecord(capsRes.routerRtpCapabilities)) {
      failHarness('signaling', 'BAD_CAPABILITIES', step, 'missing routerRtpCapabilities')
    }
    routerRtpCapabilities = capsRes.routerRtpCapabilities as Record<string, unknown>
  } catch (e) {
    failHarness(
      'signaling',
      'GET_CAPABILITIES_FAILED',
      step,
      e instanceof Error ? e.message : String(e),
    )
  }

  const device = new mediasoupClient.Device()
  try {
    await device.load({
      routerRtpCapabilities:
        routerRtpCapabilities as unknown as mediasoupClient.types.RtpCapabilities,
    })
  } catch (e) {
    failHarness('connectivity', 'DEVICE_LOAD_FAILED', step, e instanceof Error ? e.message : String(e))
  }

  const iceServers = await env.getIceServers()
  const producers: Producer[] = []
  const consumers: Consumer[] = []
  let sendTransport: Transport | null = null
  let recvTransport: Transport | null = null

  const attachTransport = async (
    created: Record<string, unknown>,
    direction: 'send' | 'recv',
  ): Promise<Transport> => {
    const transportId = typeof created.transportId === 'string' ? created.transportId : ''
    if (
      !transportId ||
      !isRecord(created.iceParameters) ||
      !Array.isArray(created.iceCandidates) ||
      !isRecord(created.dtlsParameters)
    ) {
      failHarness('connectivity', 'BAD_TRANSPORT_RESPONSE', step)
    }

    const transport =
      direction === 'send'
        ? device.createSendTransport({
            id: transportId,
            iceParameters: created.iceParameters as mediasoupClient.types.IceParameters,
            iceCandidates: created.iceCandidates as mediasoupClient.types.IceCandidate[],
            dtlsParameters: created.dtlsParameters as mediasoupClient.types.DtlsParameters,
            iceServers,
          })
        : device.createRecvTransport({
            id: transportId,
            iceParameters: created.iceParameters as mediasoupClient.types.IceParameters,
            iceCandidates: created.iceCandidates as mediasoupClient.types.IceCandidate[],
            dtlsParameters: created.dtlsParameters as mediasoupClient.types.DtlsParameters,
            iceServers,
          })

    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      void signaling
        .request('connectWebRtcTransport', { transportId, dtlsParameters })
        .then(() => callback())
        .catch((err) => errback(err instanceof Error ? err : new Error(String(err))))
    })

    if (direction === 'send') {
      transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        void signaling
          .request('produce', {
            transportId,
            kind,
            rtpParameters,
            producerClass: (appData as { producerClass?: SfuProducerClass }).producerClass,
          })
          .then((res) => {
            const producerId = typeof res.producerId === 'string' ? res.producerId : ''
            if (!producerId) throw new Error('missing producerId')
            callback({ id: producerId })
          })
          .catch((err) => errback(err instanceof Error ? err : new Error(String(err))))
      })
    }

    return transport
  }

  if (role === 'producer') {
    const created = await signaling.request('createWebRtcTransport', { producer: true, consumer: true })
    sendTransport = await attachTransport(created, 'send')
  } else {
    const created = await signaling.request('createWebRtcTransport', { producer: false, consumer: true })
    recvTransport = await attachTransport(created, 'recv')
  }

  return {
    signaling,
    device,
    sendTransport,
    recvTransport,
    producers,
    consumers,
    close() {
      for (const c of consumers) {
        try {
          c.close()
        } catch {
          /* ignore */
        }
      }
      for (const p of producers) {
        try {
          p.close()
        } catch {
          /* ignore */
        }
      }
      try {
        sendTransport?.close()
      } catch {
        /* ignore */
      }
      try {
        recvTransport?.close()
      } catch {
        /* ignore */
      }
      signaling.close()
    },
  }
}

export async function joinPeerPair(step: string): Promise<{
  publisher: HarnessPeerSession
  consumer: HarnessPeerSession
}> {
  const publisher = await setupPeer('producer', 'sess-publisher', 'participant_av', step)
  const consumer = await setupPeer('consumer', 'sess-consumer', undefined, step)
  return { publisher, consumer }
}

export async function publishParticipantAv(peer: HarnessPeerSession, step: string): Promise<void> {
  if (!peer.sendTransport) {
    failHarness('produce_consume', 'NO_SEND_TRANSPORT', step)
  }
  const stream = createSyntheticAvStream()
  for (const track of stream.getTracks()) {
    const kind = track.kind === 'audio' || track.kind === 'video' ? track.kind : null
    if (!kind) continue
    try {
      const producer = await peer.sendTransport!.produce({
        track,
        appData: { producerClass: 'participant_av' },
      })
      peer.producers.push(producer)
    } catch (e) {
      failHarness(
        'produce_consume',
        'PRODUCE_FAILED',
        step,
        e instanceof Error ? e.message : String(e),
      )
    }
  }
  if (peer.producers.length < 2) {
    failHarness('produce_consume', 'PRODUCE_INCOMPLETE', step, 'expected video+audio producers')
  }
}

export async function consumeRemoteProducers(
  consumerPeer: HarnessPeerSession,
  step: string,
): Promise<void> {
  if (!consumerPeer.recvTransport) {
    failHarness('produce_consume', 'NO_RECV_TRANSPORT', step)
  }

  wireConsumerProducerEvents(consumerPeer)

  const listRes = await consumerPeer.signaling.request('listProducers')
  const producers = Array.isArray(listRes.producers) ? listRes.producers : []
  if (producers.length === 0) {
    failHarness('produce_consume', 'NO_REMOTE_PRODUCERS', step)
  }

  for (const summary of producers) {
    if (!isRecord(summary)) continue
    const producerId = typeof summary.producerId === 'string' ? summary.producerId : ''
    if (!producerId) continue
    try {
      const res = await consumerPeer.signaling.request('consume', {
        transportId: consumerPeer.recvTransport!.id,
        producerId,
        rtpCapabilities: consumerPeer.device.rtpCapabilities,
      })
      const consumerId = typeof res.consumerId === 'string' ? res.consumerId : ''
      const kind = res.kind === 'audio' || res.kind === 'video' ? res.kind : null
      const rtpParameters = res.rtpParameters
      if (!consumerId || !kind || !isRecord(rtpParameters)) {
        failHarness('produce_consume', 'BAD_CONSUME_RESPONSE', step)
      }
      const mediasoupConsumer = await consumerPeer.recvTransport!.consume({
        id: consumerId,
        producerId,
        kind,
        rtpParameters: rtpParameters as mediasoupClient.types.RtpParameters,
      })
      consumerPeer.consumers.push(mediasoupConsumer)
      await mediasoupConsumer.resume()
    } catch (e) {
      failHarness(
        'produce_consume',
        'CONSUME_FAILED',
        step,
        e instanceof Error ? e.message : String(e),
      )
    }
  }

  if (consumerPeer.consumers.length === 0) {
    failHarness('produce_consume', 'NO_CONSUMERS_ATTACHED', step)
  }
}

export function consumerCountByKind(peer: HarnessPeerSession, kind: 'audio' | 'video'): number {
  return peer.consumers.filter((c) => c.kind === kind && !c.closed).length
}

function wireConsumerProducerEvents(peer: HarnessPeerSession): void {
  peer.signaling.onEvent = (name, data) => {
    if (name !== 'producerClosed' || !isRecord(data)) return
    const producerId = typeof data.producerId === 'string' ? data.producerId : ''
    if (!producerId) return
    const keep: Consumer[] = []
    for (const consumer of peer.consumers) {
      if (consumer.producerId === producerId) {
        try {
          consumer.close()
        } catch {
          /* ignore */
        }
      } else {
        keep.push(consumer)
      }
    }
    peer.consumers.length = 0
    for (const c of keep) peer.consumers.push(c)
  }
}

export function closeProducerKind(peer: HarnessPeerSession, kind: 'audio' | 'video'): void {
  const keep: Producer[] = []
  for (const producer of peer.producers) {
    if (producer.kind === kind) {
      try {
        producer.close()
      } catch {
        /* ignore */
      }
    } else {
      keep.push(producer)
    }
  }
  peer.producers.length = 0
  for (const p of keep) peer.producers.push(p)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function mintHarnessSfuToken(
  role: 'producer' | 'consumer',
  sessionId: string,
  producerClass?: SfuProducerClass,
): { token: string; wsUrl: string; role: 'producer' | 'consumer'; expiresInSeconds: number } {
  const env = loadHarnessEnv()
  const token = mintToken(env.sfuJwtSecret, role, sessionId, producerClass)
  return {
    token,
    wsUrl: env.sfuWsBase,
    role,
    expiresInSeconds: 900,
  }
}
