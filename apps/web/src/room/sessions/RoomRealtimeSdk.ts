/**
 * Narrow public realtime API for room sessions.
 *
 * Maintainer tooling: `realtimeDiagnostics.ts` (`?diag=1`, `window.riffsyncRealtimeDiag`) is
 * dev-only WS timeline counters and JWT probes. `getDiagnostics()` on this class is the
 * normative fan-visible / harness contract per `.ai/integration/api_contracts.md`.
 */

import type { RoomMode, RoomSnapshot } from '../../api/roomsApi'
import { fetchRtcIceServers } from '../../config/fetchRtcIceServers'
import type { ParticipantAvController } from '../sfu/participantAvSession'
import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'
import type { ParticipantProducerSnapshot } from '../participantProducerRegistry'
import {
  ChatSession,
  type AvDisabledEvent,
  type ChatGifLine,
  type ChatHistoryEvent,
  type ChatReactionEvent,
  type ChatSessionStatus,
  type ChatTextLine,
  type ChatSystemEvent,
  type PresenceEvent,
  type RoomModeEvent,
  type TypingEvent,
} from './ChatSession'
import { SfuMediaSession, type SfuMediaSessionStatus } from './SfuMediaSession'
import { collectActiveErrorCodes } from '../realtimeDrawerErrors'
import { TheaterPlayback, type TheaterPlaybackSnapshot } from './TheaterPlayback'

export type { TheaterPlaybackSnapshot }

export const DRAWER_LIFECYCLE_STATES = [
  'connected',
  'reconnecting',
  'degraded',
  'torn-down',
] as const

export type DrawerLifecycleState = (typeof DRAWER_LIFECYCLE_STATES)[number]

export type ChatDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
}

export type SfuSignalingDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
  role?: 'producer' | 'consumer'
  producerCount?: number
  consumerCount?: number
}

export type TheaterPlaybackDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
  audioContextState?: AudioContextState
}

export type RoomRealtimeDiagnostics = {
  roomId: string
  sessionId: string
  asOf: string
  drawers: {
    chat: ChatDrawerDiagnostics
    sfuSignaling: SfuSignalingDrawerDiagnostics
    theaterPlayback: TheaterPlaybackDrawerDiagnostics
  }
  activeErrorCodes: string[]
}

export type RoomControlHandlers = {
  onChatText?: (line: ChatTextLine) => void
  onChatGif?: (line: ChatGifLine) => void
  onChatReaction?: (event: ChatReactionEvent) => void
  onChatHistory?: (event: ChatHistoryEvent) => void
  onPresence?: (event: PresenceEvent) => void
  onTyping?: (event: TypingEvent) => void
  onChatSystem?: (event: ChatSystemEvent) => void
  onRoomModeUi?: (event: RoomModeEvent) => void
  onAvDisabledUi?: (event: AvDisabledEvent) => void
}

export type JoinOptions = {
  roomSnapshot: RoomSnapshot
  sessionId: string
  displayName?: string
  accessToken?: string | null
  wsUrl?: string
  apiBaseUrl?: string
  isHost?: boolean
  /**
   * Enables the Web Audio participant mix (experimental camera/mic). When false (default for the
   * primary tab-sharing experience), host_screen audio plays directly through the <video> element
   * and the mix is never constructed, so the mic wiring cannot interfere with tab-share audio.
   */
  mixEnabled?: boolean
  getIceServers?: () => Promise<RTCIceServer[]>
  getHostScreenStream?: () => MediaStream | null
  youtubeVideoId?: string | null
  roomControlHandlers?: RoomControlHandlers
  onDiagnosticsChange?: (diagnostics: RoomRealtimeDiagnostics) => void
}

export type PublishAvOptions = {
  camera: boolean
  mic: boolean
}

export type HostScreenSubscribeHandlers = {
  onRemoteStream?: (stream: MediaStream | null) => void
}

export type ParticipantAvSubscribeHandlers = {
  onConsumerTrack?: (event: SfuConsumerTrackEvent) => void
  onConsumersClear?: () => void
}

export type SubscribeHandlers = {
  hostScreen?: HostScreenSubscribeHandlers
  participantAv?: ParticipantAvSubscribeHandlers
}

export function mapChatSessionStatusToDrawerState(status: ChatSessionStatus): DrawerLifecycleState {
  switch (status) {
    case 'open':
      return 'connected'
    case 'connecting':
    case 'closed':
      return 'reconnecting'
    case 'error':
      return 'degraded'
    case 'idle':
    default:
      return 'torn-down'
  }
}

export function mapSfuMediaSessionStatusToDrawerState(
  status: SfuMediaSessionStatus,
): DrawerLifecycleState {
  switch (status) {
    case 'open':
      return 'connected'
    case 'connecting':
    case 'reconnecting':
      return 'reconnecting'
    case 'degraded':
    case 'error':
      return 'degraded'
    case 'idle':
    case 'closed':
    default:
      return 'torn-down'
  }
}

/**
 * Framework-agnostic facade over ChatSession, SfuMediaSession, and TheaterPlayback.
 */
export class RoomRealtimeSdk {
  private roomId = ''
  private sessionId = ''
  private roomMode: RoomMode = 'theater'
  private avDisabled = false
  private isHost = false
  private theaterLayoutActive = false
  private theaterBootstrapped = false
  private mediaBootstrapStarted = false
  private joinOptions: JoinOptions | null = null
  private onDiagnosticsChange: ((diagnostics: RoomRealtimeDiagnostics) => void) | undefined

  private chatLastErrorCode: string | undefined
  private sfuLastErrorCode: string | undefined
  private sfuRelayErrorMessage: string | null = null
  private getHostScreenStream: () => MediaStream | null = () => null
  private roomControlUnsubs: Array<() => void> = []
  private theaterSnapshotUnsub: (() => void) | null = null
  private theaterLifecycleUnsub: (() => void) | null = null

  private chat: ChatSession | null = null
  private sfu: SfuMediaSession | null = null
  private theater: TheaterPlayback | null = null

  // The React <video> refs fire on mount, which happens before join() constructs the theater
  // (and again after a reconnect rebuilds it). Cache the latest elements so a freshly created
  // theater always receives them, instead of the bind being silently dropped by `theater?.`.
  private guestVideoEl: HTMLVideoElement | null = null
  private hostCaptureVideoEl: HTMLVideoElement | null = null

  private chatStatusUnsub: (() => void) | null = null
  private chatLifecycleUnsub: (() => void) | null = null
  private chatSendDroppedUnsub: (() => void) | null = null
  private sfuStatusUnsub: (() => void) | null = null
  private sfuLifecycleUnsub: (() => void) | null = null
  private sfuErrorUnsub: (() => void) | null = null
  private sfuDrawerErrorUnsub: (() => void) | null = null
  private mediaPolicyUnsubs: Array<() => void> = []
  private hostScreenStreamUnsub: (() => void) | null = null
  private participantAvTrackUnsub: (() => void) | null = null
  private participantAvClearUnsub: (() => void) | null = null
  private participantAvStateUnsub: (() => void) | null = null
  private activeSubscribeHandlers: SubscribeHandlers | null = null

  join(roomId: string, options: JoinOptions): this {
    this.teardownModules({ intentional: false })

    this.roomId = roomId
    this.sessionId = options.sessionId
    this.roomMode = options.roomSnapshot.roomMode
    this.avDisabled = options.roomSnapshot.avDisabled
    this.isHost = options.isHost === true
    this.theaterLayoutActive = this.roomMode === 'theater'
    this.theaterBootstrapped = false
    this.mediaBootstrapStarted = false
    this.joinOptions = options
    this.onDiagnosticsChange = options.onDiagnosticsChange
    this.getHostScreenStream = options.getHostScreenStream ?? (() => null)
    this.sfuRelayErrorMessage = null

    this.chat = new ChatSession()
    this.sfu = new SfuMediaSession()
    this.theater = new TheaterPlayback()
    // Default off: tab-share audio plays through the <video> element, no Web Audio mix.
    this.theater.setMixEnabled(options.mixEnabled === true)
    // Re-apply any video elements bound before this theater existed (initial mount or reconnect).
    this.theater.setGuestVideoElement(this.guestVideoEl)
    this.theater.setHostCaptureVideoElement(this.hostCaptureVideoEl)

    this.wireDrawerStatusListeners()
    this.wireMediaPolicyCallbacks()
    this.wireRoomControlHandlers(options.roomControlHandlers)
    if (options.youtubeVideoId !== undefined) {
      this.theater.setYoutubeVideoId(options.youtubeVideoId)
    }

    if (options.wsUrl) {
      this.chat.connect({
        url: options.wsUrl,
        roomId,
        sessionId: options.sessionId,
        displayName: options.displayName,
        accessToken: options.accessToken ?? null,
        enabled: true,
      })
    }

    void this.bootstrapMediaPlanes()

    this.emitDiagnosticsChange()
    return this
  }

  publishAv(options: PublishAvOptions): void {
    const sfu = this.sfu
    if (!sfu) return
    const av = sfu.participantAv
    const state = av.getState()
    let changed = false

    if (options.camera !== state.cameraEnabled) {
      changed = true
      if (options.camera) {
        void av.enableCamera()
      } else {
        av.disableCamera()
      }
    }
    if (options.mic !== state.micEnabled) {
      changed = true
      if (options.mic) {
        void av.enableMic()
      } else {
        av.disableMic()
      }
    }

    if (changed) {
      this.emitDiagnosticsChange()
    }
  }

  subscribe(handlers: SubscribeHandlers): void {
    this.activeSubscribeHandlers = handlers
    this.applySubscribeHandlers()
  }

  getDiagnostics(): RoomRealtimeDiagnostics {
    const chatState = this.chat?.getLifecycleState() ?? 'torn-down'
    const sfuState = this.sfu?.getLifecycleState() ?? 'torn-down'
    const theaterState: DrawerLifecycleState = this.theater?.getLifecycleState() ?? 'torn-down'

    const sfuDiag = this.sfu?.getSignalingDiagnostics() ?? {}
    const theaterAudioContextState = this.theater?.getAudioContextState()

    const chatLastError = this.chatLastErrorCode ?? this.chat?.getLastErrorCode()
    const sfuLastError = this.sfuLastErrorCode ?? this.sfu?.getLastErrorCode()
    const theaterLastError = this.theater?.getLastErrorCode()

    const drawers: RoomRealtimeDiagnostics['drawers'] = {
      chat: {
        state: chatState,
        ...(chatLastError ? { lastErrorCode: chatLastError } : {}),
      },
      sfuSignaling: {
        state: sfuState,
        ...(sfuLastError ? { lastErrorCode: sfuLastError } : {}),
        ...(sfuDiag.role ? { role: sfuDiag.role } : {}),
        ...(sfuDiag.producerCount !== undefined ? { producerCount: sfuDiag.producerCount } : {}),
        ...(sfuDiag.consumerCount !== undefined ? { consumerCount: sfuDiag.consumerCount } : {}),
      },
      theaterPlayback: {
        state: theaterState,
        ...(theaterLastError ? { lastErrorCode: theaterLastError } : {}),
        ...(theaterAudioContextState ? { audioContextState: theaterAudioContextState } : {}),
      },
    }

    return {
      roomId: this.roomId,
      sessionId: this.sessionId,
      asOf: new Date().toISOString(),
      drawers,
      activeErrorCodes: collectActiveErrorCodes([
        drawers.chat.lastErrorCode,
        drawers.sfuSignaling.lastErrorCode,
        drawers.theaterPlayback.lastErrorCode,
      ]),
    }
  }

  teardown(): void {
    this.teardownModules({ intentional: true })
  }

  /** Returns false when chat outbound is dropped (socket not open). */
  sendControl(payload: Record<string, unknown>): boolean {
    const chat = this.chat
    if (!chat) return false
    const sent = chat.send(payload)
    if (!sent) {
      this.chatLastErrorCode = 'CHAT_SEND_DROPPED'
      this.emitDiagnosticsChange()
    }
    return sent
  }

  notifyComposeDraftChange(draft: string): void {
    this.chat?.onComposeDraftChange(draft)
  }

  notifyComposeBlur(): void {
    this.chat?.onComposeBlur()
  }

  notifyComposeSent(): void {
    this.chat?.onComposeSent()
  }

  getChatStatus(): ChatSessionStatus {
    return this.chat?.getStatus() ?? 'idle'
  }

  getSfuRelayError(): string | null {
    return this.sfuRelayErrorMessage
  }

  getParticipantAvController(): ParticipantAvController | null {
    return this.sfu?.participantAv ?? null
  }

  buildParticipantProducerSnapshots(
    sessionIds: readonly string[],
  ): Map<string, ParticipantProducerSnapshot> {
    return this.sfu?.buildParticipantProducerSnapshots(sessionIds) ?? new Map()
  }

  onParticipantProducerRegistryChange(listener: () => void): () => void {
    return this.sfu?.onParticipantProducerRegistryChange(listener) ?? (() => undefined)
  }

  unpublishHostScreen(): void {
    this.sfu?.unpublishHostScreen()
  }

  syncHostScreenPublish(opts: {
    stream: MediaStream | null
    roomMode: RoomMode
    isPublisher: boolean
  }): () => void {
    return this.sfu?.syncHostScreenPublish(opts) ?? (() => undefined)
  }

  setRoomMode(roomMode: RoomMode): void {
    if (this.roomMode === roomMode) return
    const previousMode = this.roomMode
    this.roomMode = roomMode
    this.theaterLayoutActive = roomMode === 'theater'
    this.sfu?.handleRoomModeTransition(previousMode, roomMode, this.isHost)
    if (roomMode === 'theater') {
      this.initTheaterPlayback()
    } else {
      this.theater?.configure({
        enabled: false,
        isPublisher: this.isHost,
        avDisabled: this.avDisabled,
      })
      this.theater?.detachSfuSession()
      this.theaterBootstrapped = false
    }
    this.emitDiagnosticsChange()
  }

  setAvDisabled(avDisabled: boolean): void {
    if (this.avDisabled === avDisabled) return
    const previous = this.avDisabled
    this.avDisabled = avDisabled
    this.sfu?.updatePublishGate({ avDisabled })
    if (avDisabled && !previous) {
      this.sfu?.handleAvDisabledKillSwitch()
    }
    if (this.theaterLayoutActive && this.theaterBootstrapped) {
      this.theater?.configure({
        enabled: true,
        isPublisher: this.isHost,
        avDisabled,
      })
    }
    this.emitDiagnosticsChange()
  }

  updateFanToken(accessToken: string | null): void {
    if (this.joinOptions) {
      this.joinOptions.accessToken = accessToken
    }
    this.sfu?.updatePublishGate({ fanToken: accessToken })
  }

  /**
   * Apply a display-name change seamlessly. The chat session pushes a `rename` control
   * frame on its live socket so the server updates presence in place, with no chat
   * reconnect and no presence blip. The SFU and theater planes are never touched, so
   * renaming cannot interrupt anyone's video or audio.
   */
  updateDisplayName(displayName: string): void {
    const options = this.joinOptions
    if (!options) return
    if (options.displayName === displayName) return
    options.displayName = displayName
    this.chat?.updateDisplayName(displayName)
  }

  getSfuStatus(): SfuMediaSessionStatus {
    return this.sfu?.getStatus() ?? 'idle'
  }

  getTheaterSnapshot(): TheaterPlaybackSnapshot {
    return this.theater?.getSnapshot() ?? {
      guestShareFsm: 'idle',
      guestPlayHint: false,
      hostCapturePlayHint: false,
    }
  }

  onTheaterSnapshotChange(listener: (snapshot: TheaterPlaybackSnapshot) => void): () => void {
    const theater = this.theater
    if (!theater) return () => undefined
    return theater.onSnapshotChange(listener)
  }

  setCaptureStreamForTheater(stream: MediaStream | null): void {
    this.theater?.setCaptureStream(stream)
  }

  setYoutubeVideoIdForTheater(videoId: string | null | undefined): void {
    this.theater?.setYoutubeVideoId(videoId ?? null)
  }

  bindGuestVideo(element: HTMLVideoElement | null): void {
    this.guestVideoEl = element
    this.theater?.setGuestVideoElement(element)
  }

  bindHostCaptureVideo(element: HTMLVideoElement | null): void {
    this.hostCaptureVideoEl = element
    this.theater?.setHostCaptureVideoElement(element)
  }

  playGuestVideo(): Promise<void> {
    return this.theater?.playGuestVideo() ?? Promise.resolve()
  }

  playHostCapturePreview(): Promise<void> {
    return this.theater?.playHostCapturePreview() ?? Promise.resolve()
  }

  private wireDrawerStatusListeners(): void {
    const chat = this.chat
    const sfu = this.sfu
    const theater = this.theater
    if (!chat || !sfu || !theater) return

    this.theaterLifecycleUnsub = theater.onLifecycleChange(() => {
      this.emitDiagnosticsChange()
    })
    theater.notifySignalingSiblingState(sfu.getLifecycleState())

    this.chatStatusUnsub = chat.onStatusChange((status) => {
      if (status === 'open') {
        this.chatLastErrorCode = undefined
      }
      this.emitDiagnosticsChange()
    })

    this.chatLifecycleUnsub = chat.onLifecycleChange((state) => {
      if (state === 'connected') {
        this.chatLastErrorCode = undefined
      }
      this.emitDiagnosticsChange()
    })

    this.chatSendDroppedUnsub = chat.onSendDropped((error) => {
      this.chatLastErrorCode = error.code
      this.emitDiagnosticsChange()
    })

    this.sfuStatusUnsub = sfu.onStatusChange((status) => {
      if (status === 'open') {
        this.sfuLastErrorCode = undefined
      }
      this.emitDiagnosticsChange()
    })

    this.sfuLifecycleUnsub = sfu.onLifecycleChange((state) => {
      if (state === 'connected') {
        this.sfuLastErrorCode = undefined
      } else if (state === 'degraded' && sfu.getLastErrorCode()) {
        this.sfuLastErrorCode = sfu.getLastErrorCode()
      }
      theater.notifySignalingSiblingState(state)
      this.emitDiagnosticsChange()
    })

    this.sfuErrorUnsub = sfu.onError((message) => {
      this.sfuRelayErrorMessage = message
      this.emitDiagnosticsChange()
    })

    this.sfuDrawerErrorUnsub = sfu.onDrawerError((error) => {
      this.sfuLastErrorCode = error?.code
      this.emitDiagnosticsChange()
    })

    this.participantAvStateUnsub = sfu.participantAv.subscribe(() => {
      const avError = sfu.participantAv.getState().error
      if (avError) {
        this.sfuLastErrorCode = avError
      } else if (this.sfu?.getStatus() === 'open') {
        this.sfuLastErrorCode = undefined
      }
      this.emitDiagnosticsChange()
    })
  }

  private wireMediaPolicyCallbacks(): void {
    const chat = this.chat
    const sfu = this.sfu
    const theater = this.theater
    if (!chat || !sfu || !theater) return

    this.mediaPolicyUnsubs = [
      chat.onShareState((event) => {
        if (event.state !== 'stopped') return
        sfu.handleShareStateStopped(this.isHost)
      }),
      chat.onRoomMode((event) => {
        const previousMode = this.roomMode
        this.roomMode = event.roomMode
        this.theaterLayoutActive = event.roomMode === 'theater'
        sfu.handleRoomModeTransition(previousMode, event.roomMode, this.isHost)
        if (event.roomMode === 'theater') {
          this.initTheaterPlayback()
        } else {
          theater.configure({
            enabled: false,
            isPublisher: this.isHost,
            avDisabled: this.avDisabled,
          })
          theater.detachSfuSession()
          this.theaterBootstrapped = false
        }
        this.joinOptions?.roomControlHandlers?.onRoomModeUi?.(event)
        this.emitDiagnosticsChange()
      }),
      chat.onAvDisabled((event) => {
        const previous = this.avDisabled
        this.avDisabled = event.avDisabled
        sfu.updatePublishGate({ avDisabled: event.avDisabled })
        if (event.avDisabled && !previous) {
          sfu.handleAvDisabledKillSwitch()
        }
        if (this.theaterLayoutActive && this.theaterBootstrapped) {
          theater.configure({
            enabled: true,
            isPublisher: this.isHost,
            avDisabled: event.avDisabled,
          })
        }
        this.joinOptions?.roomControlHandlers?.onAvDisabledUi?.(event)
        this.emitDiagnosticsChange()
      }),
    ]
  }

  private wireRoomControlHandlers(handlers: RoomControlHandlers | undefined): void {
    for (const unsub of this.roomControlUnsubs) unsub()
    this.roomControlUnsubs = []

    const chat = this.chat
    if (!chat || !handlers) return

    const maybePush = (unsub: () => void) => {
      this.roomControlUnsubs.push(unsub)
    }
    if (handlers.onChatText) maybePush(chat.onChatText(handlers.onChatText))
    if (handlers.onChatGif) maybePush(chat.onChatGif(handlers.onChatGif))
    if (handlers.onChatReaction) maybePush(chat.onChatReaction(handlers.onChatReaction))
    if (handlers.onChatHistory) maybePush(chat.onChatHistory(handlers.onChatHistory))
    if (handlers.onPresence) maybePush(chat.onPresence(handlers.onPresence))
    if (handlers.onTyping) maybePush(chat.onTyping(handlers.onTyping))
    if (handlers.onChatSystem) maybePush(chat.onChatSystem(handlers.onChatSystem))
  }

  private async bootstrapMediaPlanes(): Promise<void> {
    if (this.mediaBootstrapStarted) return
    this.mediaBootstrapStarted = true

    const options = this.joinOptions
    const sfu = this.sfu
    const chat = this.chat
    if (!options || !sfu || !chat) return

    const getIceServers = options.getIceServers ?? fetchRtcIceServers
    await getIceServers().catch(() => undefined)

    sfu.updatePublishGate({
      fanToken: options.accessToken ?? null,
      avDisabled: this.avDisabled,
    })

    if (options.apiBaseUrl) {
      sfu.connect({
        apiBaseUrl: options.apiBaseUrl,
        roomId: this.roomId,
        sessionId: options.sessionId,
        accessToken: options.accessToken ?? null,
        isHost: this.isHost,
        getIceServers,
        getHostScreenStream: () => this.getHostScreenStream(),
        enabled: true,
      })
    }

    if (this.theaterLayoutActive) {
      this.initTheaterPlayback()
    }

    this.emitDiagnosticsChange()
  }

  private initTheaterPlayback(): void {
    const sfu = this.sfu
    const theater = this.theater
    if (!sfu || !theater || !this.theaterLayoutActive) return

    theater.configure({
      enabled: true,
      isPublisher: this.isHost,
      avDisabled: this.avDisabled,
    })
    this.theaterBootstrapped = true
    theater.notifySignalingSiblingState(sfu.getLifecycleState())
    this.applySubscribeHandlers()
    sfu.replayActiveMediaSubscriptions()
  }

  private applySubscribeHandlers(): void {
    const sfu = this.sfu
    if (!sfu) return

    this.hostScreenStreamUnsub?.()
    this.participantAvTrackUnsub?.()
    this.participantAvClearUnsub?.()

    const handlers = this.activeSubscribeHandlers
    if (!handlers) {
      this.hostScreenStreamUnsub = null
      this.participantAvTrackUnsub = null
      this.participantAvClearUnsub = null
      return
    }

    // Read theater routing state live on each event rather than capturing it once. The engine
    // wires these subscriptions synchronously right after join(), before the async
    // bootstrapMediaPlanes() flips theaterBootstrapped to true. Capturing the boolean here left
    // the guest's host_screen stream permanently unrouted (camera still showed because its
    // consumer events route through handlers unconditionally), so the guest saw the camera but
    // never the shared tab.
    const shouldRouteTheaterMix = (): boolean =>
      this.theaterLayoutActive && this.theaterBootstrapped && this.theater !== null

    this.hostScreenStreamUnsub = sfu.onRemoteStream((stream) => {
      // Route a guest's host_screen stream to the theater whenever the room is in theater
      // layout, but do NOT also require theaterBootstrapped. That async flag flips after
      // initTheaterPlayback, so gating on it dropped streams that arrived during the bootstrap
      // window: the engine's separate guestRemote un-hid the <video> while srcObject stayed null
      // (empty 0:00 player even though the stream was consumed). TheaterPlayback buffers the
      // stream and binds srcObject once it is enabled, so layout alone is the correct gate.
      if (this.theaterLayoutActive && !this.isHost) {
        this.theater?.setGuestRemote(stream)
      }
      handlers.hostScreen?.onRemoteStream?.(stream)
      this.emitDiagnosticsChange()
    })

    this.participantAvTrackUnsub = sfu.onConsumerTrack((event) => {
      if (shouldRouteTheaterMix()) {
        this.theater?.routeSfuConsumerEvent(event)
      }
      handlers.participantAv?.onConsumerTrack?.(event)
      this.emitDiagnosticsChange()
    })

    if (handlers.participantAv?.onConsumersClear) {
      this.participantAvClearUnsub = sfu.onParticipantAvConsumersClear(
        handlers.participantAv.onConsumersClear,
      )
    } else {
      this.participantAvClearUnsub = null
    }
  }

  private emitDiagnosticsChange(): void {
    this.onDiagnosticsChange?.(this.getDiagnostics())
  }

  private teardownModules(opts: { intentional: boolean }): void {
    this.chatStatusUnsub?.()
    this.chatLifecycleUnsub?.()
    this.chatSendDroppedUnsub?.()
    this.sfuStatusUnsub?.()
    this.sfuLifecycleUnsub?.()
    this.sfuErrorUnsub?.()
    this.sfuDrawerErrorUnsub?.()
    for (const unsub of this.mediaPolicyUnsubs) unsub()
    for (const unsub of this.roomControlUnsubs) unsub()
    this.theaterSnapshotUnsub?.()
    this.theaterLifecycleUnsub?.()
    this.hostScreenStreamUnsub?.()
    this.participantAvTrackUnsub?.()
    this.participantAvClearUnsub?.()
    this.participantAvStateUnsub?.()
    this.chatStatusUnsub = null
    this.chatLifecycleUnsub = null
    this.chatSendDroppedUnsub = null
    this.sfuStatusUnsub = null
    this.sfuLifecycleUnsub = null
    this.sfuErrorUnsub = null
    this.sfuDrawerErrorUnsub = null
    this.mediaPolicyUnsubs = []
    this.roomControlUnsubs = []
    this.theaterSnapshotUnsub = null
    this.theaterLifecycleUnsub = null
    this.hostScreenStreamUnsub = null
    this.participantAvTrackUnsub = null
    this.participantAvClearUnsub = null
    this.participantAvStateUnsub = null
    this.activeSubscribeHandlers = null

    if (opts.intentional) {
      this.chat?.disconnect()
      this.sfu?.disconnect()
      this.theater?.dispose()
    }

    this.chat = null
    this.sfu = null
    this.theater = null
    this.theaterLayoutActive = false
    this.theaterBootstrapped = false
    this.mediaBootstrapStarted = false
    this.joinOptions = null
    this.onDiagnosticsChange = undefined
    this.chatLastErrorCode = undefined
    this.sfuLastErrorCode = undefined
    this.sfuRelayErrorMessage = null

    if (opts.intentional) {
      this.roomId = ''
      this.sessionId = ''
    }
  }
}
