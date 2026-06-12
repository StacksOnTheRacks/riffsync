import * as mediasoupClient from 'mediasoup-client'
import type {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  RtpParameters,
} from 'mediasoup-client/types'
import { getPublicSfuWsUrl } from '../../config/sfuWsUrl'
import { attachTransportConnectivityDrawerLog } from './transportConnectivityDrawerLog'

export type SfuTokenResponse = {
  token: string
  role: 'producer' | 'consumer'
  producerClass?: 'host_screen' | 'participant_av'
  wsUrl?: string
  expiresInSeconds?: number
}

export type SfuMediaErrorCode =
  | 'missing_ws_url'
  | 'local_sfu_unreachable'
  | 'sfu_relay_unreachable'
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
  const fromEnv = getPublicSfuWsUrl()
  if (fromEnv) return fromEnv
  const fromTok = tok.wsUrl?.trim()
  if (fromTok) return fromTok.replace(/\/$/, '')
  return undefined
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

export type SfuProducerClass = 'host_screen' | 'participant_av'

type ProducerSummary = {
  producerId: string
  kind: string
  sessionId?: string
  producerClass?: SfuProducerClass
}

type LiveProducer = {
  producer: mediasoupClient.types.Producer
  producerClass: SfuProducerClass
  kind: 'audio' | 'video'
}

export type SfuConsumerTrackEvent =
  | {
      action: 'attach'
      producerId: string
      sessionId?: string
      producerClass: SfuProducerClass | undefined
      kind: 'audio' | 'video'
      track: MediaStreamTrack
    }
  | { action: 'detach'; producerId: string }

export type SfuUnifiedSessionHandle = {
  close: (reason?: SfuSessionEndReason) => void
  sessionEnded: Promise<SfuSessionEndReason>
  ready: Promise<void>
  /** False for consumer-only SFU tokens (no send transport until producer reconnect). */
  supportsPublish: boolean
  tokenRole: 'producer' | 'consumer'
  getProducerCount: () => number
  getConsumerCount: () => number
  publishStream: (stream: MediaStream, producerClass: SfuProducerClass) => Promise<void>
  unpublishProducerKind: (producerClass: SfuProducerClass, kind: 'audio' | 'video') => void
  unpublishProducerClass: (producerClass: SfuProducerClass) => void
  detachConsumerClass: (producerClass: SfuProducerClass) => void
  pauseProducerKind: (producerClass: SfuProducerClass, kind: 'audio' | 'video') => void
  resumeProducerKind: (producerClass: SfuProducerClass, kind: 'audio' | 'video') => void
  /** Re-emit attach events for live mediasoup consumers (theater mode re-entry). */
  replayConsumerTracks: () => void
}

function parseProducerClass(value: unknown): SfuProducerClass | null {
  if (value === 'host_screen' || value === 'participant_av') return value
  return null
}

export async function connectSfuUnifiedSession(options: {
  wsBaseUrl: string
  token: string
  tokenRole: 'producer' | 'consumer'
  getIceServers: () => Promise<RTCIceServer[]>
  onRemoteStream: (stream: MediaStream | null) => void
  onConsumerTrack?: (event: SfuConsumerTrackEvent) => void
  ownSessionId?: string
  onMediaError?: (code: SfuMediaErrorCode, message: string) => void
}): Promise<SfuUnifiedSessionHandle> {
  const {
    wsBaseUrl,
    token,
    tokenRole,
    getIceServers,
    onRemoteStream,
    onConsumerTrack,
    ownSessionId,
    onMediaError,
  } = options
  const signaling = new SfuSignaling(signalingWsUrl(wsBaseUrl, token))
  let userClosed = false
  let settled = false
  let resolveEnd!: (r: SfuSessionEndReason) => void
  let resolveReady!: () => void
  let rejectReady!: (e: Error) => void
  const sessionEnded = new Promise<SfuSessionEndReason>((resolve) => {
    resolveEnd = resolve
  })
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  const finish = (r: SfuSessionEndReason) => {
    if (settled) return
    settled = true
    resolveEnd(userClosed ? 'user_close' : r)
  }

  let sendTransport: mediasoupClient.types.Transport | null = null
  let recvTransport: mediasoupClient.types.Transport | null = null
  let recvTransportId = ''
  const liveProducers: LiveProducer[] = []
  const mediasoupConsumers: mediasoupClient.types.Consumer[] = []
  const attachedProducerIds = new Set<string>()
  const consumerProducerClassById = new Map<string, SfuProducerClass>()
  const remoteStream = new MediaStream()
  const unwatchFns: Array<() => void> = []

  const emitRemote = () => {
    onRemoteStream(remoteStream.getTracks().length > 0 ? remoteStream : null)
  }

  const unpublishProducerKind = (producerClass: SfuProducerClass, kind: 'audio' | 'video') => {
    const keep: LiveProducer[] = []
    for (const lp of liveProducers) {
      if (lp.producerClass === producerClass && lp.kind === kind) {
        try {
          lp.producer.close()
        } catch {
          /* ignore */
        }
      } else {
        keep.push(lp)
      }
    }
    liveProducers.length = 0
    for (const lp of keep) liveProducers.push(lp)
  }

  const unpublishProducerClass = (producerClass: SfuProducerClass) => {
    const keep: LiveProducer[] = []
    for (const lp of liveProducers) {
      if (lp.producerClass === producerClass) {
        try {
          lp.producer.close()
        } catch {
          /* ignore */
        }
      } else {
        keep.push(lp)
      }
    }
    liveProducers.length = 0
    for (const lp of keep) liveProducers.push(lp)
  }

  const detachConsumerByProducerId = (producerId: string) => {
    const keep: typeof mediasoupConsumers = []
    for (const c of mediasoupConsumers) {
      if (c.producerId === producerId) {
        try {
          remoteStream.removeTrack(c.track)
        } catch {
          /* ignore */
        }
        try {
          c.close()
        } catch {
          /* ignore */
        }
        consumerProducerClassById.delete(producerId)
        onConsumerTrack?.({ action: 'detach', producerId })
      } else {
        keep.push(c)
      }
    }
    mediasoupConsumers.length = 0
    for (const k of keep) mediasoupConsumers.push(k)
    attachedProducerIds.delete(producerId)
  }

  const detachConsumerClass = (producerClass: SfuProducerClass) => {
    const toDetach = [...consumerProducerClassById.entries()]
      .filter(([, pc]) => pc === producerClass)
      .map(([producerId]) => producerId)
    for (const producerId of toDetach) {
      detachConsumerByProducerId(producerId)
    }
    emitRemote()
  }

  const findLiveProducer = (
    producerClass: SfuProducerClass,
    kind: 'audio' | 'video',
  ): LiveProducer | undefined =>
    liveProducers.find((lp) => lp.producerClass === producerClass && lp.kind === kind)

  const pauseProducerKind = (producerClass: SfuProducerClass, kind: 'audio' | 'video') => {
    const lp = findLiveProducer(producerClass, kind)
    if (!lp) return
    try {
      if (!lp.producer.paused) lp.producer.pause()
    } catch {
      /* ignore */
    }
  }

  const resumeProducerKind = (producerClass: SfuProducerClass, kind: 'audio' | 'video') => {
    const lp = findLiveProducer(producerClass, kind)
    if (!lp) return
    try {
      if (lp.producer.paused) lp.producer.resume()
    } catch {
      /* ignore */
    }
  }

  // Serialize all produce calls on the shared send transport. Two callers publish
  // host_screen (session connect + capture-change effect); without this lock they
  // can both unpublish-then-produce the same track concurrently, which throws in
  // mediasoup-client and can trip the SFU per-session producer cap.
  let publishChain: Promise<void> = Promise.resolve()

  const publishStream = (stream: MediaStream, producerClass: SfuProducerClass): Promise<void> => {
    const run = async (): Promise<void> => {
      if (!sendTransport) {
        throw new Error('SFU send transport not ready')
      }
      for (const track of stream.getTracks()) {
        const kind = track.kind === 'audio' || track.kind === 'video' ? track.kind : null
        if (!kind) continue
        const existing = findLiveProducer(producerClass, kind)
        if (
          existing &&
          !existing.producer.closed &&
          existing.producer.track != null &&
          existing.producer.track.id === track.id
        ) {
          continue
        }
        unpublishProducerKind(producerClass, kind)
        const producer = await sendTransport.produce({
          track,
          appData: { producerClass },
        })
        liveProducers.push({ producer, producerClass, kind })
      }
    }
    const next = publishChain.then(run, run)
    publishChain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  void (async () => {
    try {
      await signaling.connect()
    } catch {
      if (userClosed) {
        finish('user_close')
        rejectReady(new Error('user_close'))
        return
      }
      onMediaError?.('signaling_failed', 'Could not connect to video relay (signaling).')
      finish('signaling_close')
      rejectReady(new Error('signaling_failed'))
      return
    }

    const iceServers = await getIceServers()

    let routerRtpCapabilities: Record<string, unknown>
    try {
      const capsRes = await signaling.request('getRouterRtpCapabilities')
      if (!isRecord(capsRes.routerRtpCapabilities)) {
        onMediaError?.('bad_capabilities', 'Video relay misconfigured (router capabilities).')
        finish('signaling_close')
        rejectReady(new Error('bad_capabilities'))
        return
      }
      routerRtpCapabilities = capsRes.routerRtpCapabilities as Record<string, unknown>
    } catch (e) {
      onMediaError?.(
        'consume_failed',
        e instanceof Error ? e.message : 'getRouterRtpCapabilities failed',
      )
      finish('signaling_close')
      rejectReady(e instanceof Error ? e : new Error(String(e)))
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
      rejectReady(new Error('bad_capabilities'))
      return
    }

    const setupRecvTransport = async (): Promise<boolean> => {
      let created: Record<string, unknown>
      try {
        created = await signaling.request('createWebRtcTransport', { producer: false, consumer: true })
      } catch (e) {
        onMediaError?.(
          'consume_failed',
          e instanceof Error ? e.message : 'createWebRtcTransport failed',
        )
        return false
      }

      recvTransportId = typeof created.transportId === 'string' ? created.transportId : ''
      if (
        !recvTransportId ||
        !isRecord(created.iceParameters) ||
        !Array.isArray(created.iceCandidates) ||
        !isRecord(created.dtlsParameters)
      ) {
        onMediaError?.('consume_failed', 'Invalid transport response from video relay.')
        return false
      }

      recvTransport = device.createRecvTransport({
        id: recvTransportId,
        iceParameters: created.iceParameters as IceParameters,
        iceCandidates: created.iceCandidates as IceCandidate[],
        dtlsParameters: created.dtlsParameters as DtlsParameters,
        iceServers,
      })

      unwatchFns.push(
        watchTransportUntilUnhealthy(recvTransport, signaling, (r) => {
          finish(r)
        }),
      )
      unwatchFns.push(attachTransportConnectivityDrawerLog(recvTransport, iceServers))

      recvTransport.on('connect', ({ dtlsParameters: dtls }, callback, errback) => {
        void signaling
          .request('connectWebRtcTransport', { transportId: recvTransportId, dtlsParameters: dtls })
          .then(() => callback())
          .catch((e) => errback(e instanceof Error ? e : new Error(String(e))))
      })
      return true
    }

    const consumeProducer = async (summary: ProducerSummary): Promise<void> => {
      const { producerId, kind: kindHint } = summary
      if (!recvTransport || !producerId || attachedProducerIds.has(producerId)) return
      if (ownSessionId && summary.sessionId === ownSessionId) return

      let r: Record<string, unknown>
      try {
        r = await signaling.request('consume', {
          transportId: recvTransportId,
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
      if (summary.producerClass) {
        consumerProducerClassById.set(producerId, summary.producerClass)
      }
      const { track } = consumer
      // The theater "view screen" stream must carry host_screen media only.
      // participant_av (camera/mic) reaches the UI exclusively via onConsumerTrack
      // (stage tiles for video, theaterAudioMix for audio); adding it here would
      // duplicate a participant over the main video. Untagged producers default to
      // theater to preserve legacy single-share behavior.
      const isTheaterTrack = summary.producerClass !== 'participant_av'
      if (isTheaterTrack && track && !remoteStream.getTracks().includes(track)) {
        remoteStream.addTrack(track)
      }
      onConsumerTrack?.({
        action: 'attach',
        producerId,
        sessionId: summary.sessionId,
        producerClass: summary.producerClass,
        kind,
        track,
      })
    }

    const syncFromList = async (list: ProducerSummary[]): Promise<void> => {
      for (const row of list) {
        await consumeProducer(row)
      }
      emitRemote()
    }

    signaling.onEvent = (name, data) => {
      if (name === 'producerClosed') {
        if (!isRecord(data)) return
        const producerId = typeof data.producerId === 'string' ? data.producerId : ''
        if (!producerId) return
        detachConsumerByProducerId(producerId)
        emitRemote()
        return
      }
      if (name !== 'newProducer') return
      if (!isRecord(data)) return
      const producerId = typeof data.producerId === 'string' ? data.producerId : ''
      const kind = typeof data.kind === 'string' ? data.kind : 'video'
      const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined
      const producerClass = parseProducerClass(data.producerClass) ?? undefined
      if (!producerId) return
      void consumeProducer({ producerId, kind, sessionId, producerClass }).then(() => emitRemote())
    }

    if (!(await setupRecvTransport())) {
      finish('signaling_close')
      rejectReady(new Error('recv_transport_failed'))
      return
    }

    if (tokenRole === 'producer') {
      let created: Record<string, unknown>
      try {
        created = await signaling.request('createWebRtcTransport', { producer: true, consumer: false })
      } catch (e) {
        onMediaError?.(
          'produce_failed',
          e instanceof Error ? e.message : 'createWebRtcTransport failed',
        )
        finish('signaling_close')
        rejectReady(e instanceof Error ? e : new Error(String(e)))
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
        rejectReady(new Error('send_transport_invalid'))
        return
      }

      sendTransport = device.createSendTransport({
        id: transportId,
        iceParameters: created.iceParameters as IceParameters,
        iceCandidates: created.iceCandidates as IceCandidate[],
        dtlsParameters: created.dtlsParameters as DtlsParameters,
        iceServers,
      })

      unwatchFns.push(
        watchTransportUntilUnhealthy(sendTransport, signaling, (r) => {
          finish(r)
        }),
      )
      unwatchFns.push(attachTransportConnectivityDrawerLog(sendTransport, iceServers))

      sendTransport.on('connect', ({ dtlsParameters: dtls }, callback, errback) => {
        void signaling
          .request('connectWebRtcTransport', { transportId, dtlsParameters: dtls })
          .then(() => callback())
          .catch((e) => errback(e instanceof Error ? e : new Error(String(e))))
      })

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        const producerClass = isRecord(appData) ? parseProducerClass(appData.producerClass) : null
        if (!producerClass) {
          errback(new Error('producerClass required'))
          return
        }
        void signaling
          .request('produce', { transportId, kind, rtpParameters, producerClass })
          .then((res) => {
            const pid = typeof res.producerId === 'string' ? res.producerId : ''
            if (!pid) throw new Error('no producerId')
            callback({ id: pid })
          })
          .catch((e) => errback(e instanceof Error ? e : new Error(String(e))))
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
          const sessionId = typeof row.sessionId === 'string' ? row.sessionId : undefined
          const producerClass = parseProducerClass(row.producerClass) ?? undefined
          if (producerId) initial.push({ producerId, kind, sessionId, producerClass })
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
      rejectReady(e instanceof Error ? e : new Error(String(e)))
      return
    }

    resolveReady()
  })()

  return {
    ready,
    supportsPublish: tokenRole === 'producer',
    tokenRole,
    getProducerCount: () => liveProducers.length,
    getConsumerCount: () => mediasoupConsumers.length,
    publishStream,
    unpublishProducerKind,
    unpublishProducerClass,
    detachConsumerClass,
    pauseProducerKind,
    resumeProducerKind,
    replayConsumerTracks: () => {
      for (const consumer of mediasoupConsumers) {
        onConsumerTrack?.({
          action: 'attach',
          producerId: consumer.producerId,
          producerClass: consumerProducerClassById.get(consumer.producerId),
          kind: consumer.kind === 'audio' || consumer.kind === 'video' ? consumer.kind : 'audio',
          track: consumer.track,
        })
      }
    },
    close: (reason: SfuSessionEndReason = 'user_close') => {
      userClosed = true
      void reason
      for (const fn of unwatchFns) fn()
      unpublishProducerClass('host_screen')
      unpublishProducerClass('participant_av')
      for (const c of mediasoupConsumers) {
        onConsumerTrack?.({ action: 'detach', producerId: c.producerId })
        try {
          c.close()
        } catch {
          /* ignore */
        }
      }
      mediasoupConsumers.length = 0
      attachedProducerIds.clear()
      consumerProducerClassById.clear()
      remoteStream.getTracks().forEach((t) => {
        try {
          remoteStream.removeTrack(t)
        } catch {
          /* ignore */
        }
      })
      onRemoteStream(null)
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

/** @deprecated Use connectSfuUnifiedSession */
export async function connectSfuProducer(options: {
  wsBaseUrl: string
  token: string
  captureStream: MediaStream
  getIceServers: () => Promise<RTCIceServer[]>
  onMediaError?: (code: SfuMediaErrorCode, message: string) => void
}): Promise<{ close: (reason?: SfuSessionEndReason) => void; sessionEnded: Promise<SfuSessionEndReason> }> {
  const session = await connectSfuUnifiedSession({
    wsBaseUrl: options.wsBaseUrl,
    token: options.token,
    tokenRole: 'producer',
    getIceServers: options.getIceServers,
    onRemoteStream: () => undefined,
    onMediaError: options.onMediaError,
  })
  await session.ready
  await session.publishStream(options.captureStream, 'host_screen')
  return { close: session.close, sessionEnded: session.sessionEnded }
}

/** @deprecated Use connectSfuUnifiedSession */
export async function connectSfuConsumer(options: {
  wsBaseUrl: string
  token: string
  getIceServers: () => Promise<RTCIceServer[]>
  onRemoteStream: (stream: MediaStream | null) => void
  onMediaError?: (code: SfuMediaErrorCode, message: string) => void
}): Promise<{ close: (reason?: SfuSessionEndReason) => void; sessionEnded: Promise<SfuSessionEndReason> }> {
  const session = await connectSfuUnifiedSession({
    wsBaseUrl: options.wsBaseUrl,
    token: options.token,
    tokenRole: 'consumer',
    getIceServers: options.getIceServers,
    onRemoteStream: options.onRemoteStream,
    onMediaError: options.onMediaError,
  })
  await session.ready
  return { close: session.close, sessionEnded: session.sessionEnded }
}

/** Resolve WS base from token response and build-time env (shared helper for session runner). */
export function resolveSfuWsBaseForToken(tok: SfuTokenResponse): string | undefined {
  return resolveWsBase(tok)
}
