import * as mediasoupClient from 'mediasoup-client'
import type {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  RtpParameters,
} from 'mediasoup-client/types'
import { getPublicSfuWsUrl } from '../../config/sfuWsUrl'

export type SfuTokenResponse = {
  token: string
  role: 'producer' | 'consumer'
  wsUrl?: string
  expiresInSeconds?: number
}

export type SfuMediaErrorCode =
  | 'missing_ws_url'
  | 'signaling_failed'
  | 'signaling_closed'
  | 'transport_failed'
  | 'transport_stalled'
  | 'consume_failed'
  | 'produce_failed'
  | 'bad_capabilities'

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
  private eventChain: Promise<void> = Promise.resolve()

  constructor(urlWithToken: string) {
    this.ws = new WebSocket(urlWithToken)
  }

  set onEvent(cb: (name: string, data: Record<string, unknown>) => void) {
    this.onEventFn = cb
  }

  /** Serialize async handlers for `newProducer` / `producerClosed` so they do not overlap. */
  enqueueEvent(handler: () => void | Promise<void>): void {
    this.eventChain = this.eventChain.then(() => Promise.resolve(handler())).catch(() => undefined)
  }

  get closed(): boolean {
    return this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING
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

  onLifetimeEnded(cb: () => void): void {
    this.ws.addEventListener('close', cb, { once: true })
    this.ws.addEventListener(
      'error',
      () => {
        cb()
      },
      { once: true },
    )
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
      const name = msg.name
      const data = msg.data as Record<string, unknown>
      const fn = this.onEventFn
      if (fn) {
        this.enqueueEvent(async () => {
          fn(name, data)
        })
      }
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
      const requestId = `${Date.now().toString(36)}-${id}`
      this.pending.set(id, { resolve, reject })
      this.ws.send(
        JSON.stringify({
          type: 'request',
          id,
          requestId,
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

function resolveWsBase(tok: SfuTokenResponse): string | undefined {
  const fromTok = tok.wsUrl?.trim()
  if (fromTok) return fromTok.replace(/\/$/, '')
  return getPublicSfuWsUrl()
}

export type SfuSessionEndReason =
  | 'signaling_close'
  | 'transport_failed'
  | 'transport_disconnected_timeout'
  | 'user_close'

const DISCONNECT_RECOVERY_MS = 8000

function watchTransportUntilUnhealthy(
  transport: mediasoupClient.types.Transport,
  signaling: SfuSignaling,
  onEnd: (reason: SfuSessionEndReason) => void,
): () => void {
  let discTimer: ReturnType<typeof setTimeout> | null = null
  const clearDisc = () => {
    if (discTimer !== null) {
      clearTimeout(discTimer)
      discTimer = null
    }
  }
  const onConn = () => {
    const s = transport.connectionState
    if (s === 'failed') {
      clearDisc()
      transport.removeListener('connectionstatechange', onConn)
      onEnd('transport_failed')
      return
    }
    if (s === 'disconnected') {
      clearDisc()
      discTimer = setTimeout(() => {
        discTimer = null
        const cur = transport.connectionState
        if (cur === 'disconnected' || cur === 'failed') {
          transport.removeListener('connectionstatechange', onConn)
          onEnd('transport_disconnected_timeout')
        }
      }, DISCONNECT_RECOVERY_MS)
      return
    }
    if (s === 'connected') {
      clearDisc()
    }
  }
  transport.on('connectionstatechange', onConn)
  const onSigDone = () => {
    clearDisc()
    transport.removeListener('connectionstatechange', onConn)
    onEnd('signaling_close')
  }
  signaling.onLifetimeEnded(onSigDone)
  return () => {
    clearDisc()
    transport.removeListener('connectionstatechange', onConn)
  }
}

export async function connectSfuProducer(options: {
  wsBaseUrl: string
  token: string
  captureStream: MediaStream
  getIceServers: () => Promise<RTCIceServer[]>
  onMediaError?: (code: SfuMediaErrorCode, message: string) => void
}): Promise<{ close: (reason?: SfuSessionEndReason) => void; sessionEnded: Promise<SfuSessionEndReason> }> {
  const { wsBaseUrl, token, captureStream, getIceServers, onMediaError } = options
  const signaling = new SfuSignaling(signalingWsUrl(wsBaseUrl, token))
  let userClosed = false
  let settled = false
  let resolveEnd!: (r: SfuSessionEndReason) => void
  const sessionEnded = new Promise<SfuSessionEndReason>((resolve) => {
    resolveEnd = resolve
  })
  const finish = (r: SfuSessionEndReason) => {
    if (settled) return
    settled = true
    resolveEnd(userClosed ? 'user_close' : r)
  }

  void (async () => {
    try {
      await signaling.connect()
    } catch {
      onMediaError?.('signaling_failed', 'Could not connect to video relay (signaling).')
      finish('signaling_close')
      return
    }

    const iceServers = await getIceServers()

    let routerRtpCapabilities: Record<string, unknown>
    try {
      const capsRes = await signaling.request('getRouterRtpCapabilities')
      if (!isRecord(capsRes.routerRtpCapabilities)) {
        onMediaError?.('bad_capabilities', 'Video relay misconfigured (router capabilities).')
        finish('signaling_close')
        return
      }
      routerRtpCapabilities = capsRes.routerRtpCapabilities as Record<string, unknown>
    } catch (e) {
      onMediaError?.(
        'consume_failed',
        e instanceof Error ? e.message : 'getRouterRtpCapabilities failed',
      )
      finish('signaling_close')
      return
    }

    const device = new mediasoupClient.Device()
    try {
      await device.load({
        routerRtpCapabilities: routerRtpCapabilities as unknown as mediasoupClient.types.RtpCapabilities,
      })
    } catch {
      onMediaError?.('bad_capabilities', 'This browser cannot load the video relay codecs.')
      finish('signaling_close')
      return
    }

    let created: Record<string, unknown>
    try {
      created = await signaling.request('createWebRtcTransport', { producer: true, consumer: false })
    } catch (e) {
      onMediaError?.(
        'produce_failed',
        e instanceof Error ? e.message : 'createWebRtcTransport failed',
      )
      finish('signaling_close')
      return
    }

    const transportId = typeof created.transportId === 'string' ? created.transportId : ''
    if (
      !transportId ||
      !isRecord(created.iceParameters) ||
      !Array.isArray(created.iceCandidates) ||
      !isRecord(created.dtlsParameters)
    ) {
      onMediaError?.('produce_failed', 'Invalid transport response from video relay.')
      finish('signaling_close')
      return
    }

    const sendTransport = device.createSendTransport({
      id: transportId,
      iceParameters: created.iceParameters as IceParameters,
      iceCandidates: created.iceCandidates as IceCandidate[],
      dtlsParameters: created.dtlsParameters as DtlsParameters,
      iceServers,
    })

    let unwatch: (() => void) | null = null
    unwatch = watchTransportUntilUnhealthy(sendTransport, signaling, (r) => {
      unwatch?.()
      finish(r)
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

    try {
      for (const track of captureStream.getTracks()) {
        await sendTransport.produce({ track })
      }
    } catch (e) {
      onMediaError?.(
        'produce_failed',
        e instanceof Error ? e.message : 'Failed to publish track to relay.',
      )
      unwatch?.()
      finish('transport_failed')
      return
    }
  })()

  return {
    close: (reason: SfuSessionEndReason = 'user_close') => {
      userClosed = true
      void reason
      try {
        signaling.close()
      } catch {
        /* ignore */
      }
      if (!settled) finish('user_close')
    },
    sessionEnded,
  }
}

type ProducerSummary = { producerId: string; kind: string }

export async function connectSfuConsumer(options: {
  wsBaseUrl: string
  token: string
  getIceServers: () => Promise<RTCIceServer[]>
  onRemoteStream: (stream: MediaStream | null) => void
  onMediaError?: (code: SfuMediaErrorCode, message: string) => void
}): Promise<{ close: (reason?: SfuSessionEndReason) => void; sessionEnded: Promise<SfuSessionEndReason> }> {
  const { wsBaseUrl, token, getIceServers, onRemoteStream, onMediaError } = options
  const signaling = new SfuSignaling(signalingWsUrl(wsBaseUrl, token))
  let userClosed = false
  let settled = false
  let resolveEnd!: (r: SfuSessionEndReason) => void
  const sessionEnded = new Promise<SfuSessionEndReason>((resolve) => {
    resolveEnd = resolve
  })
  const finish = (r: SfuSessionEndReason) => {
    if (settled) return
    settled = true
    resolveEnd(userClosed ? 'user_close' : r)
  }

  void (async () => {
      try {
        await signaling.connect()
      } catch {
        onMediaError?.('signaling_failed', 'Could not connect to video relay (signaling).')
        finish('signaling_close')
        return
      }

      const iceServers = await getIceServers()

      let routerRtpCapabilities: Record<string, unknown>
      try {
        const capsRes = await signaling.request('getRouterRtpCapabilities')
        if (!isRecord(capsRes.routerRtpCapabilities)) {
          onMediaError?.('bad_capabilities', 'Video relay misconfigured (router capabilities).')
          finish('signaling_close')
          return
        }
        routerRtpCapabilities = capsRes.routerRtpCapabilities as Record<string, unknown>
      } catch (e) {
        onMediaError?.(
          'consume_failed',
          e instanceof Error ? e.message : 'getRouterRtpCapabilities failed',
        )
        finish('signaling_close')
        return
      }

      const device = new mediasoupClient.Device()
      try {
        await device.load({
          routerRtpCapabilities: routerRtpCapabilities as unknown as mediasoupClient.types.RtpCapabilities,
        })
      } catch {
        onMediaError?.('bad_capabilities', 'This browser cannot load the video relay codecs.')
        finish('signaling_close')
        return
      }

      let created: Record<string, unknown>
      try {
        created = await signaling.request('createWebRtcTransport', { producer: false, consumer: true })
      } catch (e) {
        onMediaError?.(
          'consume_failed',
          e instanceof Error ? e.message : 'createWebRtcTransport failed',
        )
        finish('signaling_close')
        return
      }

      const transportId = typeof created.transportId === 'string' ? created.transportId : ''
      if (
        !transportId ||
        !isRecord(created.iceParameters) ||
        !Array.isArray(created.iceCandidates) ||
        !isRecord(created.dtlsParameters)
      ) {
        onMediaError?.('consume_failed', 'Invalid transport response from video relay.')
        finish('signaling_close')
        return
      }

      const recvTransport = device.createRecvTransport({
        id: transportId,
        iceParameters: created.iceParameters as IceParameters,
        iceCandidates: created.iceCandidates as IceCandidate[],
        dtlsParameters: created.dtlsParameters as DtlsParameters,
        iceServers,
      })

      let unwatch: (() => void) | null = null
      unwatch = watchTransportUntilUnhealthy(recvTransport, signaling, (r) => {
        unwatch?.()
        finish(r)
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
        let r: Record<string, unknown>
        try {
          r = await signaling.request('consume', {
            transportId,
            producerId,
            rtpCapabilities: device.rtpCapabilities,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          onMediaError?.('consume_failed', msg.includes('gone') ? 'Host stream ended; waiting for share.' : msg)
          return
        }
        const consumerId = typeof r.consumerId === 'string' ? r.consumerId : ''
        const kind =
          r.kind === 'audio' || r.kind === 'video'
            ? r.kind
            : kindHint === 'audio' || kindHint === 'video'
              ? kindHint
              : null
        const rtpParameters = r.rtpParameters
        if (!consumerId || !kind || !isRecord(rtpParameters)) return

        let consumer: mediasoupClient.types.Consumer
        try {
          consumer = await recvTransport.consume({
            id: consumerId,
            producerId,
            kind,
            rtpParameters: rtpParameters as RtpParameters,
          })
        } catch (e) {
          onMediaError?.(
            'consume_failed',
            e instanceof Error ? e.message : 'consume failed on device',
          )
          return
        }
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

      signaling.onEvent = (name, data) => {
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
        void consumeProducer(producerId, kind).then(() => {
          onRemoteStream(stream.getTracks().length > 0 ? stream : null)
        })
      }

      try {
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
      } catch (e) {
        onMediaError?.(
          'consume_failed',
          e instanceof Error ? e.message : 'listProducers failed',
        )
        finish('signaling_close')
      }
  })()

  return {
    close: (reason: SfuSessionEndReason = 'user_close') => {
      userClosed = true
      void reason
      try {
        signaling.close()
      } catch {
        /* ignore */
      }
      onRemoteStream(null)
      if (!settled) finish('user_close')
    },
    sessionEnded,
  }
}

/** Resolve WS base from token response and build-time env (shared helper for session runner). */
export function resolveSfuWsBaseForToken(tok: SfuTokenResponse): string | undefined {
  return resolveWsBase(tok)
}
