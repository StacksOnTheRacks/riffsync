import * as mediasoupClient from 'mediasoup-client'
import type {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  RtpParameters,
} from 'mediasoup-client/types'

export type SfuTokenResponse = {
  token: string
  role: 'producer' | 'consumer'
  wsUrl?: string
  expiresInSeconds?: number
}

function signalingWsUrl(base: string, token: string): string {
  const u = new URL(base)
  u.searchParams.set('token', token)
  return u.toString()
}

type Pending = {
  resolve: (v: Record<string, unknown>) => void
  reject: (e: Error) => void
}

export class SfuSignaling {
  private ws: WebSocket
  private nextId = 0
  private pending = new Map<number, Pending>()
  private onEventFn: ((name: string, data: Record<string, unknown>) => void) | null = null

  constructor(urlWithToken: string) {
    this.ws = new WebSocket(urlWithToken)
  }

  set onEvent(cb: (name: string, data: Record<string, unknown>) => void) {
    this.onEventFn = cb
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve()
      this.ws.onerror = () => reject(new Error('SFU WebSocket failed to open'))
    })
    this.ws.onmessage = (ev) => {
      void this.handleMessage(ev.data as string)
    }
  }

  close(): void {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
    for (const [, p] of this.pending) {
      p.reject(new Error('signaling closed'))
    }
    this.pending.clear()
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }
    if (msg.type === 'event' && typeof msg.name === 'string' && isRecord(msg.data)) {
      this.onEventFn?.(msg.name, msg.data as Record<string, unknown>)
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
      this.ws.send(JSON.stringify({ type: 'request', id, method, data }))
    })
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export async function connectSfuProducer(options: {
  wsBaseUrl: string
  token: string
  captureStream: MediaStream
  getIceServers: () => Promise<RTCIceServer[]>
}): Promise<{ close: () => void }> {
  const { wsBaseUrl, token, captureStream, getIceServers } = options
  const signaling = new SfuSignaling(signalingWsUrl(wsBaseUrl, token))
  await signaling.connect()

  const iceServers = await getIceServers()

  const { routerRtpCapabilities } = await signaling.request('getRouterRtpCapabilities')
  if (!isRecord(routerRtpCapabilities)) {
    signaling.close()
    throw new Error('missing routerRtpCapabilities')
  }

  const device = new mediasoupClient.Device()
  await device.load({
    routerRtpCapabilities: routerRtpCapabilities as unknown as mediasoupClient.types.RtpCapabilities,
  })

  const created = await signaling.request('createWebRtcTransport', { producer: true, consumer: false })
  const transportId = typeof created.transportId === 'string' ? created.transportId : ''
  if (
    !transportId ||
    !isRecord(created.iceParameters) ||
    !Array.isArray(created.iceCandidates) ||
    !isRecord(created.dtlsParameters)
  ) {
    signaling.close()
    throw new Error('bad createWebRtcTransport response')
  }

  const sendTransport = device.createSendTransport({
    id: transportId,
    iceParameters: created.iceParameters as IceParameters,
    iceCandidates: created.iceCandidates as IceCandidate[],
    dtlsParameters: created.dtlsParameters as DtlsParameters,
    iceServers,
  })

  sendTransport.on('connect', ({ dtlsParameters: dtls }, callback, errback) => {
    void signaling
      .request('connectWebRtcTransport', { transportId, dtlsParameters: dtls })
      .then(() => callback())
      .catch((e) => errback(e instanceof Error ? e : new Error(String(e))))
  })

  sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
    void appData
    void signaling
      .request('produce', { transportId, kind, rtpParameters })
      .then((r) => {
        const pid = typeof r.producerId === 'string' ? r.producerId : ''
        if (!pid) throw new Error('no producerId')
        callback({ id: pid })
      })
      .catch((e) => errback(e instanceof Error ? e : new Error(String(e))))
  })

  for (const track of captureStream.getTracks()) {
    await sendTransport.produce({ track })
  }

  return {
    close: () => {
      try {
        sendTransport.close()
      } catch {
        /* ignore */
      }
      signaling.close()
    },
  }
}

type ProducerSummary = { producerId: string; kind: string }

export async function connectSfuConsumer(options: {
  wsBaseUrl: string
  token: string
  getIceServers: () => Promise<RTCIceServer[]>
  onRemoteStream: (stream: MediaStream | null) => void
}): Promise<{ close: () => void }> {
  const { wsBaseUrl, token, getIceServers, onRemoteStream } = options
  const signaling = new SfuSignaling(signalingWsUrl(wsBaseUrl, token))
  await signaling.connect()

  const iceServers = await getIceServers()

  const { routerRtpCapabilities } = await signaling.request('getRouterRtpCapabilities')
  if (!isRecord(routerRtpCapabilities)) {
    signaling.close()
    throw new Error('missing routerRtpCapabilities')
  }

  const device = new mediasoupClient.Device()
  await device.load({
    routerRtpCapabilities: routerRtpCapabilities as unknown as mediasoupClient.types.RtpCapabilities,
  })

  const created = await signaling.request('createWebRtcTransport', { producer: false, consumer: true })
  const transportId = typeof created.transportId === 'string' ? created.transportId : ''
  if (
    !transportId ||
    !isRecord(created.iceParameters) ||
    !Array.isArray(created.iceCandidates) ||
    !isRecord(created.dtlsParameters)
  ) {
    signaling.close()
    throw new Error('bad createWebRtcTransport response')
  }

  const recvTransport = device.createRecvTransport({
    id: transportId,
    iceParameters: created.iceParameters as IceParameters,
    iceCandidates: created.iceCandidates as IceCandidate[],
    dtlsParameters: created.dtlsParameters as DtlsParameters,
    iceServers,
  })

  recvTransport.on('connect', ({ dtlsParameters: dtls }, callback, errback) => {
    void signaling
      .request('connectWebRtcTransport', { transportId, dtlsParameters: dtls })
      .then(() => callback())
      .catch((e) => errback(e instanceof Error ? e : new Error(String(e))))
  })

  const attachedProducerIds = new Set<string>()
  const mediasoupConsumers: mediasoupClient.types.Consumer[] = []
  const stream = new MediaStream()

  const consumeProducer = async (producerId: string, kindHint: string): Promise<void> => {
    if (attachedProducerIds.has(producerId)) return
    const r = await signaling.request('consume', {
      transportId,
      producerId,
      rtpCapabilities: device.rtpCapabilities,
    })
    const consumerId = typeof r.consumerId === 'string' ? r.consumerId : ''
    const kind = r.kind === 'audio' || r.kind === 'video' ? r.kind : kindHint === 'audio' || kindHint === 'video' ? kindHint : null
    const rtpParameters = r.rtpParameters
    if (!consumerId || !kind || !isRecord(rtpParameters)) return

    const consumer = await recvTransport.consume({
      id: consumerId,
      producerId,
      kind,
      rtpParameters: rtpParameters as RtpParameters,
    })
    mediasoupConsumers.push(consumer)
    attachedProducerIds.add(producerId)
    const { track } = consumer
    if (track && !stream.getTracks().includes(track)) {
      stream.addTrack(track)
    }
  }

  const syncFromList = async (list: ProducerSummary[]): Promise<void> => {
    for (const { producerId, kind } of list) {
      await consumeProducer(producerId, kind)
    }
    onRemoteStream(stream.getTracks().length > 0 ? stream : null)
  }

  const listRes = await signaling.request('listProducers')
  const producersRaw = listRes.producers
  const initial: ProducerSummary[] = []
  if (Array.isArray(producersRaw)) {
    for (const row of producersRaw) {
      if (!isRecord(row)) continue
      const producerId = typeof row.producerId === 'string' ? row.producerId : ''
      const kind = typeof row.kind === 'string' ? row.kind : ''
      if (producerId) initial.push({ producerId, kind })
    }
  }
  if (initial.length > 0) {
    await syncFromList(initial)
  }

  signaling.onEvent = async (name, data) => {
    if (name === 'producerClosed') {
      if (!isRecord(data)) return
      const producerId = typeof data.producerId === 'string' ? data.producerId : ''
      if (!producerId) return
      const keep: typeof mediasoupConsumers = []
      for (const c of mediasoupConsumers) {
        if (c.producerId === producerId) {
          try {
            stream.removeTrack(c.track)
          } catch {
            /* ignore */
          }
          try {
            c.close()
          } catch {
            /* ignore */
          }
        } else {
          keep.push(c)
        }
      }
      mediasoupConsumers.length = 0
      for (const k of keep) mediasoupConsumers.push(k)
      attachedProducerIds.delete(producerId)
      onRemoteStream(stream.getTracks().length > 0 ? stream : null)
      return
    }
    if (name !== 'newProducer') return
    if (!isRecord(data)) return
    const producerId = typeof data.producerId === 'string' ? data.producerId : ''
    const kind = typeof data.kind === 'string' ? data.kind : 'video'
    if (!producerId) return
    await consumeProducer(producerId, kind)
    onRemoteStream(stream.getTracks().length > 0 ? stream : null)
  }

  return {
    close: () => {
      for (const c of mediasoupConsumers) {
        try {
          c.close()
        } catch {
          /* ignore */
        }
      }
      mediasoupConsumers.length = 0
      try {
        recvTransport.close()
      } catch {
        /* ignore */
      }
      signaling.close()
      onRemoteStream(null)
    },
  }
}
