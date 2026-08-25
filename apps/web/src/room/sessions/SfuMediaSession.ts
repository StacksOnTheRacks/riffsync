import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import type { RoomMode } from '../../api/roomsApi'
import { trackGaEvent } from '../../config/googleAnalytics'
import {
  isParticipantAvTokenHardFail,
  participantAvErrorFromSfuSessionEnd,
  participantAvErrorFromSfuTokenDenial,
  SfuTokenHttpError,
} from '../av/participantAvErrors'
import {
  connectSfuUnifiedSession,
  resolveSfuWsBaseForToken,
  type SfuConsumerTrackEvent,
  type SfuMediaErrorCode,
  type SfuProducerClass,
  type SfuTransportConnectivityHealthEvent,
  type SfuUnifiedSessionHandle,
} from '../sfu/mediasoupSharing'
import {
  emitPartialUnpublishDrawerLog,
  emitProduceConsumeMediaErrorLog,
  emitProducerClosedDrawerLog,
} from '../sfu/produceConsumeDrawerLog'
import { classifySignalingOpenFailure, type SfuConfigMediaErrorCode } from '../sfu/sfuConfigErrors'
import {
  createBoundParticipantAvController,
  type ParticipantAvController,
  type ParticipantAvPublishGate,
} from '../sfu/participantAvSession'
import { nextSfuReconnectDelayMs, sleepMs } from '../sfu/sfuReconnectPolicy'
import { enteredVideoChatMode } from '../roomMediaLifecycle'
import {
  messageForSfuRelayConfigError,
  type SfuRelayConfigErrorCode,
} from '../sfu/sfuConfigErrors'
import {
  mapSfuConfigMediaCodeToDrawerError,
  mapSfuMediaCodeToDrawerError,
  mapSfuTokenDeniedError,
  type RealtimeDrawerError,
  type RealtimeDrawerErrorCode,
} from '../realtimeDrawerErrors'
import { emitClientDrawerLog } from '../clientDrawerLog'
import { sfuLifecycleAfterFailedCycle } from './drawerReconnectPolicy'
import { resolveJwtRemintDelayMs } from './sfuJwtRemintSchedule'
import { resolveSfuTokenRequest } from './sfuTokenRequest'
import {
  applyAudioProducerPaused,
  applyProducerClosed,
  applyProducerOpened,
  buildParticipantProducerSnapshots,
  clearParticipantProducerRegistry,
  createParticipantProducerRegistryState,
  type ParticipantProducerRegistryState,
  type ParticipantProducerSnapshot,
  snapshotForSession,
  localSnapshotFromParticipantAv,
} from '../participantProducerRegistry'
import type { SignalingProducerLifecycleEvent } from '../sfu/mediasoupSharing'

export { resolveSfuTokenProducerClass, resolveSfuTokenRequest } from './sfuTokenRequest'

export type SfuMediaSessionStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'error'
  | 'reconnecting'
  | 'degraded'

/** Normative drawer lifecycle for diagnostics (`execution_model.md`). */
export type SfuMediaSessionLifecycleState =
  | 'connected'
  | 'reconnecting'
  | 'degraded'
  | 'torn-down'

export type SfuConnectivityDiagnostics = {
  state: SfuMediaSessionLifecycleState
  lastErrorCode?: 'ICE_FAILED' | 'TURN_RELAY_REQUIRED'
  iceConnectionState?: RTCIceConnectionState
}

export type SfuProduceConsumeDiagnostics = {
  state: SfuMediaSessionLifecycleState
  lastErrorCode?: Extract<
    RealtimeDrawerErrorCode,
    'TRANSPORT_LIMIT_REACHED' | 'CONSUMER_LIMIT_REACHED' | 'sfu_publish_rejected'
  >
  producerCount?: number
  consumerCount?: number
  hostScreenAttached?: boolean
  participantAvPublishActive?: boolean
}

export type SfuHealthDiagnostics = {
  connectivity: SfuConnectivityDiagnostics
  produceConsume: SfuProduceConsumeDiagnostics
}

export type SfuRoomSessionHandle = SfuUnifiedSessionHandle

type SessionHooks = {
  assignSession: (session: SfuRoomSessionHandle | null) => void
  onMissingWsUrl: () => void
  onTokenError: (message: string) => void
  onMediaError: (code: SfuMediaErrorCode, message: string) => void
  onSessionClean?: () => void
  onConnecting?: () => void
  onSessionReady?: () => void
  onTokenMinted?: (tok: import('../sfu/mediasoupSharing').SfuTokenResponse) => void
}

export type StartSfuRoomSessionOpts = SessionHooks & {
  apiBaseUrl: string | undefined
  roomId: string
  sessionId: string
  accessToken: string | null
  isHost?: boolean
  getIceServers: () => Promise<RTCIceServer[]>
  onRemoteStream: (stream: MediaStream | null) => void
  onConsumerTrack?: (event: SfuConsumerTrackEvent) => void
  onSignalingProducerLifecycle?: (event: SignalingProducerLifecycleEvent) => void
  onConnectivityHealth?: (event: SfuTransportConnectivityHealthEvent) => void
  getHostScreenStream: () => MediaStream | null
  participantAv: ParticipantAvController
}

export type SfuMediaSessionConnectOptions = {
  apiBaseUrl: string | undefined
  roomId: string
  sessionId: string
  accessToken: string | null
  isHost?: boolean
  getIceServers: () => Promise<RTCIceServer[]>
  getHostScreenStream: () => MediaStream | null
  enabled?: boolean
}

function isSfuRelayConfigErrorCode(code: string): code is SfuRelayConfigErrorCode {
  return (
    code === 'missing_ws_url' ||
    code === 'local_sfu_unreachable' ||
    code === 'sfu_relay_unreachable'
  )
}

function connectivitySeverity(state: SfuMediaSessionLifecycleState): number {
  switch (state) {
    case 'degraded':
      return 3
    case 'reconnecting':
      return 2
    case 'connected':
      return 1
    case 'torn-down':
    default:
      return 0
  }
}

function classifyProduceConsumeHealthError(
  code: SfuMediaErrorCode,
  message: string,
): SfuProduceConsumeDiagnostics['lastErrorCode'] | undefined {
  const lower = message.toLowerCase()
  if (lower.includes('transport limit reached')) return 'TRANSPORT_LIMIT_REACHED'
  if (lower.includes('consumer limit reached')) return 'CONSUMER_LIMIT_REACHED'
  if (code === 'produce_failed' || code === 'bad_capabilities') return 'sfu_publish_rejected'
  return undefined
}

function isProduceConsumeHealthFailure(code: SfuMediaErrorCode, message: string): boolean {
  if (code === 'produce_failed' || code === 'bad_capabilities') return true
  if (code !== 'consume_failed') return false
  const lower = message.toLowerCase()
  return !lower.includes('gone') && !lower.includes('host stream ended')
}

export function formatSfuTokenError(e: unknown): string {
  if (e instanceof SfuTokenHttpError) {
    const fromApi = e.apiError?.trim()
    if (fromApi) {
      return `Video relay denied access. ${fromApi} If this persists, wait until the room shows connected, refresh, or sign in again.`
    }
  }
  const msg = e instanceof Error ? e.message : String(e)
  const m403 = /^sfu-token 403:\s*(.+)$/s.exec(msg)
  if (m403) {
    const fromApi = m403[1].trim()
    if (fromApi)
      return `Video relay denied access. ${fromApi} If this persists, wait until the room shows connected, refresh, or sign in again.`
  }
  return msg
}

function routeParticipantAvTokenDenial(
  participantAv: ParticipantAvController,
  producerClass: SfuProducerClass | undefined,
  e: unknown,
): boolean {
  if (producerClass !== 'participant_av') return false
  if (!(e instanceof SfuTokenHttpError)) return false
  const avCode = participantAvErrorFromSfuTokenDenial(e.status, e.code)
  if (!avCode) return false
  participantAv.failPublish(avCode)
  return isParticipantAvTokenHardFail(e.code)
}

/** Transient: WS is open but Dynamo roster GSI has not caught up yet (`webrtc-sfu-token` 403). */
export function isRosterConsistency403(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return (
    /sfu-token\s+403:/i.test(msg) &&
    /open the room websocket first|unknown session for this room/i.test(msg)
  )
}

async function sleepBackoffMs(ms: number, signal: AbortSignal): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end && !signal.aborted) {
    const slice = Math.min(400, end - Date.now())
    if (slice <= 0) break
    await sleepMs(slice)
  }
}

async function publishHostScreenIfNeeded(
  session: SfuUnifiedSessionHandle,
  getHostScreenStream: () => MediaStream | null,
  onMediaError: (code: SfuMediaErrorCode, message: string) => void,
): Promise<void> {
  const stream = getHostScreenStream()
  const live = stream?.getTracks().some((track) => track.readyState === 'live') ?? false
  if (!live || !stream) {
    session.unpublishProducerClass('host_screen')
    return
  }
  try {
    await session.ready
  } catch {
    return
  }
  try {
    await session.publishStream(stream, 'host_screen')
  } catch (e) {
    onMediaError(
      'produce_failed',
      e instanceof Error ? e.message : 'Failed to publish host screen to relay.',
    )
  }
}

/**
 * One SFU WebSocket per tab: shared consumers plus optional host_screen / participant_av producers.
 */
export function startSfuRoomSession(opts: StartSfuRoomSessionOpts): { cancel: () => void } {
  const ac = new AbortController()
  const { signal } = ac
  const { assignSession, participantAv } = opts
  let attempt = 0
  let activeClose: (() => void) | null = null
  let consecutiveWsOpenFailures = 0
  let activeConfigError: SfuConfigMediaErrorCode | null = null
  let signalingClassificationGen = 0

  const cancel = () => {
    ac.abort()
    activeClose?.()
    activeClose = null
    participantAv.attachSession(null)
    assignSession(null)
    opts.onSessionClean?.()
  }

  void (async () => {
    while (!signal.aborted) {
      const api = opts.apiBaseUrl
      const roomId = opts.roomId
      if (!api || !roomId) {
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      const tokenRequest = resolveSfuTokenRequest({
        participantAv,
        getHostScreenStream: opts.getHostScreenStream,
        isHost: opts.isHost === true,
      })

      let tok
      try {
        tok = await fetchSfuJoinToken({
          apiBaseUrl: api,
          roomId,
          sessionId: opts.sessionId,
          accessToken: opts.accessToken,
          ...(tokenRequest.role === 'producer'
            ? { producerClasses: tokenRequest.producerClasses }
            : {}),
        })
      } catch (e) {
        if (signal.aborted) break
        const legacyClass =
          tokenRequest.role === 'producer' ? tokenRequest.producerClasses[0] : undefined
        const hardFail = routeParticipantAvTokenDenial(participantAv, legacyClass, e)
        const rosterRace = isRosterConsistency403(e)
        if (!hardFail && (!rosterRace || attempt >= 4)) {
          opts.onTokenError(formatSfuTokenError(e))
        }
        const delayMs = hardFail
          ? nextSfuReconnectDelayMs(attempt)
          : rosterRace
            ? Math.min(2500, 200 + 350 * Math.max(0, attempt))
            : nextSfuReconnectDelayMs(attempt)
        await sleepBackoffMs(delayMs, signal)
        attempt++
        continue
      }

      if (signal.aborted) break

      opts.onTokenMinted?.(tok)

      const wantsProducer = tokenRequest.role === 'producer'
      if (wantsProducer && tok.role !== 'producer') {
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }
      if (!wantsProducer && tok.role !== 'consumer') {
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      const wsBase = resolveSfuWsBaseForToken(tok)
      if (!wsBase) {
        opts.onMissingWsUrl()
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      attempt = 0
      if (!activeConfigError) {
        opts.onConnecting?.()
      }

      const session = await connectSfuUnifiedSession({
        wsBaseUrl: wsBase,
        token: tok.token,
        tokenRole: tok.role,
        getIceServers: opts.getIceServers,
        onRemoteStream: opts.onRemoteStream,
        onConsumerTrack: opts.onConsumerTrack,
        onSignalingProducerLifecycle: opts.onSignalingProducerLifecycle,
        onConnectivityHealth: opts.onConnectivityHealth,
        ownSessionId: opts.sessionId,
        onMediaError: (code, message) => {
          if (code !== 'signaling_failed') {
            opts.onMediaError(code, message)
            return
          }
          consecutiveWsOpenFailures++
          const classificationGen = ++signalingClassificationGen
          void (async () => {
            const classified = await classifySignalingOpenFailure(
              wsBase,
              consecutiveWsOpenFailures,
              signal,
            )
            if (signal.aborted || classificationGen !== signalingClassificationGen) return
            if (classified.code && classified.message) {
              activeConfigError = classified.code
              opts.onMediaError(classified.code, classified.message)
              return
            }
            if (!activeConfigError) {
              opts.onMediaError(code, message)
            }
          })()
        },
      })

      if (signal.aborted) {
        session.close()
        break
      }

      try {
        await session.ready
      } catch {
        // Release the half-open session's transports/peer connections before retrying;
        // otherwise every failed connect leaks an RTCPeerConnection.
        session.close()
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      consecutiveWsOpenFailures = 0
      activeConfigError = null
      signalingClassificationGen++
      opts.onSessionReady?.()

      activeClose = () => session.close()
      assignSession(session)
      participantAv.attachSession(session)
      await publishHostScreenIfNeeded(session, opts.getHostScreenStream, opts.onMediaError)

      const reason = await session.sessionEnded
      // Fully close the ended session (transports, consumers, signaling) before reconnecting.
      // sessionEnded only signals the end; without an explicit close the peer connections leak,
      // eventually tripping the browser cap ("Cannot create so many PeerConnections").
      session.close()
      activeClose = null
      participantAv.attachSession(null)
      assignSession(null)
      opts.onSessionClean?.()
      if (reason === 'user_close' || signal.aborted) break
      const hadPublishIntent = participantAv.getState().needsProducerToken
      const sessionErr = participantAvErrorFromSfuSessionEnd(reason, {
        hadPublishIntent,
        reconnectAttempts: attempt,
      })
      if (sessionErr) {
        participantAv.failPublish(sessionErr)
      } else {
        participantAv.resetOnReconnect()
      }
      await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
    }
  })()

  return { cancel }
}

type Listener<T> = (event: T) => void

/**
 * Framework-agnostic SFU media orchestration: signaling reconnect loop, participant AV
 * publish gate, and mediasoup produce/consume lifecycle.
 */
export class SfuMediaSession {
  private status: SfuMediaSessionStatus = 'idle'
  private lifecycleState: SfuMediaSessionLifecycleState = 'torn-down'
  private failedReconnectCycles = 0
  private lastErrorCode: RealtimeDrawerErrorCode | undefined
  private lastConnectivityErrorCode: SfuConnectivityDiagnostics['lastErrorCode'] | undefined
  private lastProduceConsumeErrorCode: SfuProduceConsumeDiagnostics['lastErrorCode'] | undefined
  private produceConsumeDegraded = false
  private cancelReconnect: (() => void) | null = null
  private sessionHandle: SfuUnifiedSessionHandle | null = null
  private tokenIntentGeneration = 0
  private connectOptions: SfuMediaSessionConnectOptions | null = null
  private enabled = false
  private jwtRemintTimer: ReturnType<typeof setTimeout> | null = null
  private lastMintedToken: string | null = null
  private lastMintedExpiresInSeconds: number | undefined

  private readonly gate: ParticipantAvPublishGate = {
    fanToken: null,
    avDisabled: true,
  }

  readonly participantAv: ParticipantAvController

  private remoteStreamListeners = new Set<Listener<MediaStream | null>>()
  private consumerTrackListeners = new Set<Listener<SfuConsumerTrackEvent>>()
  private readonly attachedConsumerMeta = new Map<
    string,
    { producerClass: SfuProducerClass | undefined; kind: 'audio' | 'video' }
  >()
  private lastRemoteStream: MediaStream | null = null
  private errorListeners = new Set<Listener<string | null>>()
  private drawerErrorListeners = new Set<Listener<RealtimeDrawerError | null>>()
  private statusListeners = new Set<Listener<SfuMediaSessionStatus>>()
  private lifecycleListeners = new Set<Listener<SfuMediaSessionLifecycleState>>()
  private healthListeners = new Set<Listener<SfuHealthDiagnostics>>()
  private participantAvConsumerClearListeners = new Set<Listener<void>>()
  private participantProducerRegistry: ParticipantProducerRegistryState =
    createParticipantProducerRegistryState()
  private participantProducerRegistryListeners = new Set<Listener<void>>()
  private participantAvStateUnsub: (() => void) | null = null
  private ownSessionId: string | null = null
  private hostBroadcastGaTracked = false
  private readonly connectivityByTransport = new Map<string, SfuConnectivityDiagnostics>()

  constructor() {
    this.participantAv = createBoundParticipantAvController(() => this.gate, {
      onPartialUnpublish: () => emitPartialUnpublishDrawerLog(),
    })
    this.gate.onNeedsProducerTokenChange = () => this.onNeedsProducerTokenChange()
  }

  getStatus(): SfuMediaSessionStatus {
    return this.status
  }

  getLifecycleState(): SfuMediaSessionLifecycleState {
    return this.lifecycleState
  }

  getLastErrorCode(): RealtimeDrawerErrorCode | undefined {
    return this.lastErrorCode
  }

  getSessionHandle(): SfuUnifiedSessionHandle | null {
    return this.sessionHandle
  }

  getSignalingDiagnostics(): {
    role?: 'producer' | 'consumer'
  } {
    const handle = this.sessionHandle
    if (!handle || this.status !== 'open') return {}
    return {
      role: handle.tokenRole,
    }
  }

  getHealthDiagnostics(): SfuHealthDiagnostics {
    const handle = this.sessionHandle
    const participantAv = this.participantAv.getState()
    const participantAvPublishActive = participantAv.cameraEnabled || participantAv.micEnabled
    const hasProducerClass =
      typeof handle?.hasProducerClass === 'function'
        ? handle.hasProducerClass.bind(handle)
        : () => false
    const hasConsumerClass =
      typeof handle?.hasConsumerClass === 'function'
        ? handle.hasConsumerClass.bind(handle)
        : () => false
    const getProducerCount =
      typeof handle?.getProducerCount === 'function' ? handle.getProducerCount.bind(handle) : () => 0
    const getConsumerCount =
      typeof handle?.getConsumerCount === 'function' ? handle.getConsumerCount.bind(handle) : () => 0
    const hostScreenAttached =
      hasProducerClass('host_screen') ||
      hasConsumerClass('host_screen') ||
      (this.lastRemoteStream?.getTracks().some((track) => track.readyState === 'live') ?? false)

    return {
      connectivity: this.getConnectivityDiagnostics(),
      produceConsume: {
        state: this.getProduceConsumeHealthState(),
        ...(this.lastProduceConsumeErrorCode
          ? { lastErrorCode: this.lastProduceConsumeErrorCode }
          : {}),
        producerCount: getProducerCount(),
        consumerCount: getConsumerCount(),
        hostScreenAttached,
        participantAvPublishActive,
      },
    }
  }

  private getConnectivityDiagnostics(): SfuConnectivityDiagnostics {
    if (this.lifecycleState === 'torn-down' || this.status === 'idle') {
      return { state: 'torn-down' }
    }
    if (this.lastConnectivityErrorCode && this.connectivityByTransport.size === 0) {
      return { state: 'degraded', lastErrorCode: this.lastConnectivityErrorCode }
    }
    if (this.connectivityByTransport.size === 0) {
      return { state: this.lifecycleState }
    }

    let selected: SfuConnectivityDiagnostics | null = null
    for (const health of this.connectivityByTransport.values()) {
      if (!selected || connectivitySeverity(health.state) > connectivitySeverity(selected.state)) {
        selected = health
      }
    }
    return selected ?? { state: this.lifecycleState }
  }

  private getProduceConsumeHealthState(): SfuMediaSessionLifecycleState {
    if (this.lifecycleState === 'torn-down' || this.status === 'idle') return 'torn-down'
    if (this.produceConsumeDegraded) return 'degraded'
    if (this.lifecycleState === 'degraded') return 'degraded'
    if (this.lifecycleState === 'reconnecting') return 'reconnecting'
    return this.status === 'open' ? 'connected' : this.lifecycleState
  }

  onRemoteStream(listener: Listener<MediaStream | null>): () => void {
    this.remoteStreamListeners.add(listener)
    return () => this.remoteStreamListeners.delete(listener)
  }

  onConsumerTrack(listener: Listener<SfuConsumerTrackEvent>): () => void {
    this.consumerTrackListeners.add(listener)
    return () => this.consumerTrackListeners.delete(listener)
  }

  onError(listener: Listener<string | null>): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  onDrawerError(listener: Listener<RealtimeDrawerError | null>): () => void {
    this.drawerErrorListeners.add(listener)
    return () => this.drawerErrorListeners.delete(listener)
  }

  onStatusChange(listener: Listener<SfuMediaSessionStatus>): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onLifecycleChange(listener: Listener<SfuMediaSessionLifecycleState>): () => void {
    this.lifecycleListeners.add(listener)
    return () => this.lifecycleListeners.delete(listener)
  }

  onHealthChange(listener: Listener<SfuHealthDiagnostics>): () => void {
    this.healthListeners.add(listener)
    return () => this.healthListeners.delete(listener)
  }

  /** Fired when participant_av producer registry changes (People tab cam/mic). */
  onParticipantProducerRegistryChange(listener: Listener<void>): () => void {
    this.participantProducerRegistryListeners.add(listener)
    return () => this.participantProducerRegistryListeners.delete(listener)
  }

  getParticipantProducerSnapshot(sessionId: string): ParticipantProducerSnapshot {
    if (!this.ownSessionId || sessionId !== this.ownSessionId) {
      return snapshotForSession(this.participantProducerRegistry, sessionId)
    }
    return localSnapshotFromParticipantAv(this.participantAv.getState())
  }

  buildParticipantProducerSnapshots(sessionIds: readonly string[]): Map<string, ParticipantProducerSnapshot> {
    const ownSessionId = this.ownSessionId ?? ''
    return buildParticipantProducerSnapshots(
      this.participantProducerRegistry,
      sessionIds,
      ownSessionId,
      this.participantAv.getState(),
    )
  }

  /** Fired when participant_av consumers should be cleared (kill switch). */
  onParticipantAvConsumersClear(listener: Listener<void>): () => void {
    this.participantAvConsumerClearListeners.add(listener)
    return () => this.participantAvConsumerClearListeners.delete(listener)
  }

  updatePublishGate(partial: {
    fanToken?: string | null
    avDisabled?: boolean
  }): void {
    if (partial.fanToken !== undefined) {
      this.gate.fanToken = partial.fanToken
      if (this.connectOptions) {
        this.connectOptions = { ...this.connectOptions, accessToken: partial.fanToken }
      }
    }
    if (partial.avDisabled !== undefined) this.gate.avDisabled = partial.avDisabled
    this.participantAv.refreshPublishGate()
  }

  connect(options: SfuMediaSessionConnectOptions): void {
    this.connectOptions = { ...options }
    this.ownSessionId = options.sessionId
    this.hostBroadcastGaTracked = false
    this.enabled = options.enabled !== false
    this.participantAvStateUnsub?.()
    this.participantAvStateUnsub = this.participantAv.subscribe(() => {
      this.emitParticipantProducerRegistryChange()
      this.emitHealthChange()
    })
    this.stopReconnectLoop()
    if (!this.enabled || !options.apiBaseUrl || !options.roomId) {
      this.setStatus('idle')
      this.setLifecycleState('torn-down')
      return
    }
    this.failedReconnectCycles = 0
    this.lastErrorCode = undefined
    this.lastConnectivityErrorCode = undefined
    this.lastProduceConsumeErrorCode = undefined
    this.produceConsumeDegraded = false
    this.connectivityByTransport.clear()
    this.emitHealthChange()
    this.startReconnectLoop()
  }

  disconnect(): void {
    this.enabled = false
    this.hostBroadcastGaTracked = false
    this.participantAvStateUnsub?.()
    this.participantAvStateUnsub = null
    this.ownSessionId = null
    this.resetParticipantProducerRegistry()
    this.clearJwtRemintTimer()
    this.stopReconnectLoop()
    this.participantAv.teardownPublishing()
    this.sessionHandle?.unpublishProducerClass('host_screen')
    this.attachedConsumerMeta.clear()
    this.emitRemoteStream(null)
    this.failedReconnectCycles = 0
    this.lastErrorCode = undefined
    this.lastConnectivityErrorCode = undefined
    this.lastProduceConsumeErrorCode = undefined
    this.produceConsumeDegraded = false
    this.connectivityByTransport.clear()
    this.setStatus('idle')
    this.setLifecycleState('torn-down')
    this.emitError(null)
    this.emitDrawerError(null)
    this.emitHealthChange()
  }

  /** Guest: detach host_screen consumers only when share stops. */
  handleShareStateStopped(isPublisher: boolean): void {
    if (isPublisher) return
    this.detachHostScreenConsumers()
    this.emitRemoteStream(null)
  }

  /** Room mode transition: stop host_screen producers/consumers per media policy. */
  handleRoomModeTransition(
    previousMode: RoomMode,
    nextMode: RoomMode,
    isPublisher: boolean,
  ): void {
    if (!enteredVideoChatMode(previousMode, nextMode)) return
    if (!isPublisher) {
      this.detachHostScreenConsumers()
      this.emitRemoteStream(null)
      return
    }
    this.unpublishHostScreen()
  }

  /** Kill switch: tear down participant AV producers and consumers. */
  handleAvDisabledKillSwitch(): void {
    this.participantAv.teardownPublishing()
    this.sessionHandle?.detachConsumerClass('participant_av')
    this.resetParticipantProducerRegistry()
    for (const listener of this.participantAvConsumerClearListeners) listener()
  }

  unpublishHostScreen(): void {
    this.sessionHandle?.unpublishProducerClass('host_screen')
    this.emitHealthChange()
  }

  detachHostScreenConsumers(): void {
    this.sessionHandle?.detachConsumerClass('host_screen')
    this.emitHealthChange()
  }

  /** Re-deliver live SFU consumer attach events and last host_screen stream to subscribers. */
  replayActiveMediaSubscriptions(): void {
    this.sessionHandle?.replayConsumerTracks()
    for (const listener of this.remoteStreamListeners) {
      listener(this.lastRemoteStream)
    }
  }

  /** Publish or unpublish host tab capture on the existing SFU session (no full reconnect). */
  syncHostScreenPublish(opts: {
    stream: MediaStream | null
    roomMode: RoomMode
    isPublisher: boolean
  }): () => void {
    const { stream, roomMode, isPublisher } = opts
    if (!this.enabled || !isPublisher) return () => undefined
    const session = this.sessionHandle
    if (!session) {
      emitClientDrawerLog({
        drawer: 'produce_consume',
        event: 'host_screen_publish_skipped',
        outcome: 'retry',
        code: 'no_session',
      })
      return () => undefined
    }

    if (roomMode === 'videoChat') {
      session.unpublishProducerClass('host_screen')
      return () => undefined
    }

    const live = stream?.getTracks().some((track) => track.readyState === 'live') ?? false
    if (!live || !stream) {
      emitClientDrawerLog({
        drawer: 'produce_consume',
        event: 'host_screen_publish_skipped',
        outcome: 'retry',
        code: 'no_live_track',
      })
      session.unpublishProducerClass('host_screen')
      return () => undefined
    }

    emitClientDrawerLog({
      drawer: 'produce_consume',
      event: 'host_screen_publish_attempt',
      outcome: 'recovered',
    })
    let cancelled = false
    void (async () => {
      try {
        await session.ready
        if (cancelled) return
        await session.publishStream(stream, 'host_screen')
        if (!cancelled && !this.hostBroadcastGaTracked) {
          this.hostBroadcastGaTracked = true
          trackGaEvent('host_broadcast_start', {
            is_authenticated: Boolean(this.connectOptions?.accessToken),
          })
        }
      } catch (e) {
        emitClientDrawerLog({
          drawer: 'produce_consume',
          event: 'host_screen_publish_failed',
          outcome: 'failed',
          code: e instanceof Error ? e.name : 'error',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }

  private dispatchConsumerTrack(event: SfuConsumerTrackEvent): void {
    if (event.action === 'attach') {
      this.attachedConsumerMeta.set(event.producerId, {
        producerClass: event.producerClass,
        kind: event.kind,
      })
    } else if (event.action === 'detach') {
      const meta = this.attachedConsumerMeta.get(event.producerId)
      this.attachedConsumerMeta.delete(event.producerId)
      if (meta?.producerClass === 'participant_av' && meta.kind === 'video') {
        emitProducerClosedDrawerLog()
      }
    } else if (
      (event.action === 'pause' || event.action === 'resume') &&
      event.producerClass === 'participant_av' &&
      event.kind === 'audio'
    ) {
      this.participantProducerRegistry = applyAudioProducerPaused(
        this.participantProducerRegistry,
        event.producerId,
        event.action === 'pause',
      )
      this.emitParticipantProducerRegistryChange()
    }
    for (const listener of this.consumerTrackListeners) listener(event)
    this.emitHealthChange()
  }

  private applySignalingProducerLifecycle(event: SignalingProducerLifecycleEvent): void {
    if (event.producerClass !== 'participant_av') return
    if (event.action === 'opened') {
      this.participantProducerRegistry = applyProducerOpened(
        this.participantProducerRegistry,
        event.producerId,
        event.sessionId,
        event.kind,
      )
    } else {
      this.participantProducerRegistry = applyProducerClosed(
        this.participantProducerRegistry,
        event.producerId,
      )
    }
    this.emitParticipantProducerRegistryChange()
    this.emitHealthChange()
  }

  private applyConnectivityHealth(event: SfuTransportConnectivityHealthEvent): void {
    if (event.state === 'torn-down') {
      this.connectivityByTransport.delete(event.transportId)
    } else {
      this.connectivityByTransport.set(event.transportId, {
        state: event.state,
        ...(event.lastErrorCode ? { lastErrorCode: event.lastErrorCode } : {}),
        ...(event.iceConnectionState ? { iceConnectionState: event.iceConnectionState } : {}),
      })
    }
    if (event.lastErrorCode) {
      this.lastConnectivityErrorCode = event.lastErrorCode
    } else if (event.state === 'connected') {
      this.lastConnectivityErrorCode = undefined
    }
    this.emitHealthChange()
  }

  private resetParticipantProducerRegistry(): void {
    this.participantProducerRegistry = clearParticipantProducerRegistry()
    this.emitParticipantProducerRegistryChange()
    this.emitHealthChange()
  }

  private emitParticipantProducerRegistryChange(): void {
    for (const listener of this.participantProducerRegistryListeners) listener()
  }

  private onNeedsProducerTokenChange(): void {
    if (this.sessionHandle?.supportsPublish) return
    this.tokenIntentGeneration++
    if (!this.enabled || !this.connectOptions) return
    this.restartReconnectLoop()
  }

  private restartReconnectLoop(): void {
    this.stopReconnectLoop()
    this.startReconnectLoop()
  }

  private startReconnectLoop(): void {
    const opts = this.connectOptions
    if (!opts || !this.enabled) return

    this.setStatus('connecting')
    this.setLifecycleState(
      this.failedReconnectCycles > 0
        ? sfuLifecycleAfterFailedCycle(this.failedReconnectCycles)
        : 'reconnecting',
    )
    const generation = this.tokenIntentGeneration

    const { cancel } = startSfuRoomSession({
      apiBaseUrl: opts.apiBaseUrl,
      roomId: opts.roomId,
      sessionId: opts.sessionId,
      accessToken: opts.accessToken,
      isHost: opts.isHost,
      getIceServers: opts.getIceServers,
      getHostScreenStream: opts.getHostScreenStream,
      participantAv: this.participantAv,
      onRemoteStream: (stream) => this.emitRemoteStream(stream),
      onConsumerTrack: (event) => this.dispatchConsumerTrack(event),
      onSignalingProducerLifecycle: (event) => this.applySignalingProducerLifecycle(event),
      onConnectivityHealth: (event) => this.applyConnectivityHealth(event),
      assignSession: (s) => {
        this.sessionHandle = s
        if (s) {
          emitClientDrawerLog({
            drawer: 'signaling',
            event: 'signaling_open',
            outcome: 'recovered',
          })
          this.setStatus('open')
          this.setLifecycleState('connected')
        }
      },
      onMissingWsUrl: () => {
        this.emitDrawerError(mapSfuConfigMediaCodeToDrawerError('missing_ws_url'))
        this.emitError(messageForSfuRelayConfigError('missing_ws_url'))
      },
      onTokenError: (msg) => this.emitError(msg),
      onMediaError: (code, msg) => {
        if (code === 'consume_failed' || code === 'produce_failed') {
          emitProduceConsumeMediaErrorLog(code, msg)
        }
        if (isProduceConsumeHealthFailure(code, msg)) {
          this.produceConsumeDegraded = true
          this.lastProduceConsumeErrorCode = classifyProduceConsumeHealthError(code, msg)
          this.emitHealthChange()
        }
        const drawerError = mapSfuMediaCodeToDrawerError(code)
        if (isSfuRelayConfigErrorCode(code)) {
          this.emitDrawerError(drawerError)
          this.emitError(messageForSfuRelayConfigError(code))
          return
        }
        this.emitDrawerError(drawerError)
        // Participant publish hard-fail is handled by syncPublish and session-end
        // failPublish. Transient produce/consume errors during producer-token upgrade
        // reconnect must not toggle camera/mic off while the loop retries.
        if (!this.participantAv.getState().needsProducerToken) {
          this.emitError(msg)
        }
      },
      onConnecting: () => {
        this.emitError(null)
        this.emitDrawerError(null)
        emitClientDrawerLog({
          drawer: 'signaling',
          event: 'signaling_connect',
          outcome: 'retry',
        })
        this.setStatus('connecting')
        this.setLifecycleState(
          this.failedReconnectCycles > 0
            ? sfuLifecycleAfterFailedCycle(this.failedReconnectCycles)
            : 'reconnecting',
        )
      },
      onSessionReady: () => {
        const recoveredFromReconnect = this.failedReconnectCycles > 0
        this.emitError(null)
        this.emitDrawerError(null)
        this.failedReconnectCycles = 0
        this.lastErrorCode = undefined
        this.lastConnectivityErrorCode = undefined
        this.lastProduceConsumeErrorCode = undefined
        this.produceConsumeDegraded = false
        this.setStatus('open')
        this.setLifecycleState('connected')
        this.emitHealthChange()
        if (recoveredFromReconnect) {
          emitClientDrawerLog({
            drawer: 'signaling',
            event: 'signaling_reconnect_success',
            outcome: 'recovered',
          })
        }
        if (this.lastMintedToken) {
          this.scheduleJwtRemint(this.lastMintedToken, this.lastMintedExpiresInSeconds)
        }
      },
      onTokenMinted: (tok) => {
        this.lastMintedToken = tok.token
        this.lastMintedExpiresInSeconds = tok.expiresInSeconds
      },
      onSessionClean: () => {
        this.clearJwtRemintTimer()
        this.sessionHandle = null
        this.attachedConsumerMeta.clear()
        this.connectivityByTransport.clear()
        this.resetParticipantProducerRegistry()
        if (this.enabled && generation === this.tokenIntentGeneration) {
          emitClientDrawerLog({
            drawer: 'signaling',
            event: 'signaling_close',
            outcome: 'retry',
            severity: 'warn',
          })
          emitClientDrawerLog({
            drawer: 'signaling',
            event: 'signaling_reconnect_scheduled',
            outcome: 'retry',
          })
          this.failedReconnectCycles += 1
          const lifecycle = sfuLifecycleAfterFailedCycle(this.failedReconnectCycles)
          this.setStatus(lifecycle === 'degraded' ? 'degraded' : 'reconnecting')
          this.setLifecycleState(lifecycle)
        }
      },
    })

    this.cancelReconnect = () => {
      cancel()
      this.sessionHandle = null
    }
  }

  private stopReconnectLoop(): void {
    this.clearJwtRemintTimer()
    this.cancelReconnect?.()
    this.cancelReconnect = null
    this.sessionHandle = null
  }

  private clearJwtRemintTimer(): void {
    if (this.jwtRemintTimer !== null) {
      clearTimeout(this.jwtRemintTimer)
      this.jwtRemintTimer = null
    }
  }

  private scheduleJwtRemint(token: string, expiresInSeconds?: number): void {
    this.clearJwtRemintTimer()
    if (this.getStatus() !== 'open') return

    const delayMs = resolveJwtRemintDelayMs(token, expiresInSeconds)
    if (delayMs === null) return

    this.jwtRemintTimer = setTimeout(() => {
      this.jwtRemintTimer = null
      void this.remintJoinToken()
    }, delayMs)
  }

  private async remintJoinToken(): Promise<void> {
    const opts = this.connectOptions
    if (!opts || !this.enabled || this.getStatus() !== 'open') return

    const tokenRequest = resolveSfuTokenRequest({
      participantAv: this.participantAv,
      getHostScreenStream: opts.getHostScreenStream,
      isHost: opts.isHost === true,
    })

    try {
      const tok = await fetchSfuJoinToken({
        apiBaseUrl: opts.apiBaseUrl,
        roomId: opts.roomId,
        sessionId: opts.sessionId,
        accessToken: opts.accessToken,
        ...(tokenRequest.role === 'producer'
          ? { producerClasses: tokenRequest.producerClasses }
          : {}),
      })
      this.lastErrorCode = undefined
      if (this.getStatus() === 'open') {
        this.scheduleJwtRemint(tok.token, tok.expiresInSeconds)
      }
    } catch (cause) {
      const drawerError = mapSfuTokenDeniedError(cause)
      this.lastErrorCode = drawerError.code
      emitClientDrawerLog({
        drawer: 'signaling',
        event: 'token_denied',
        code: drawerError.code,
        outcome: 'failed',
      })
      this.emitDrawerError(drawerError)
      this.setStatus('degraded')
      this.setLifecycleState('degraded')
    }
  }

  private setStatus(next: SfuMediaSessionStatus): void {
    if (this.status === next) return
    this.status = next
    for (const listener of this.statusListeners) listener(next)
  }

  private setLifecycleState(next: SfuMediaSessionLifecycleState): void {
    if (this.lifecycleState === next) return
    const prev = this.lifecycleState
    this.lifecycleState = next
    if (next === 'degraded' && prev !== 'degraded') {
      emitClientDrawerLog({
        drawer: 'signaling',
        event: 'signaling_degraded',
        outcome: 'failed',
        severity: 'warn',
      })
    }
    for (const listener of this.lifecycleListeners) listener(next)
  }

  private emitRemoteStream(stream: MediaStream | null): void {
    this.lastRemoteStream = stream
    for (const listener of this.remoteStreamListeners) listener(stream)
    this.emitHealthChange()
  }

  private emitError(message: string | null): void {
    for (const listener of this.errorListeners) listener(message)
  }

  private emitDrawerError(error: RealtimeDrawerError | null): void {
    this.lastErrorCode = error?.code
    if (error?.drawer === 'connectivity') {
      if (error.code === 'ICE_FAILED' || error.code === 'TURN_RELAY_REQUIRED') {
        this.lastConnectivityErrorCode = error.code
        this.emitHealthChange()
      }
    } else if (
      error?.code === 'TRANSPORT_LIMIT_REACHED' ||
      error?.code === 'CONSUMER_LIMIT_REACHED' ||
      error?.code === 'sfu_publish_rejected'
    ) {
      this.produceConsumeDegraded = true
      this.lastProduceConsumeErrorCode = error.code
      this.emitHealthChange()
    } else if (error === null) {
      this.lastConnectivityErrorCode = undefined
      this.lastProduceConsumeErrorCode = undefined
      this.produceConsumeDegraded = false
      this.emitHealthChange()
    }
    for (const listener of this.drawerErrorListeners) listener(error)
  }

  private emitHealthChange(): void {
    const diagnostics = this.getHealthDiagnostics()
    for (const listener of this.healthListeners) listener(diagnostics)
  }
}
