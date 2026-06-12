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
import {
  ChatSession,
  type AvDisabledEvent,
  type ChatGifLine,
  type ChatReactionEvent,
  type ChatSessionStatus,
  type ChatTextLine,
  type PresenceEvent,
  type RoomModeEvent,
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
  onPresence?: (event: PresenceEvent) => void
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

  getChatStatus(): ChatSessionStatus {
    return this.chat?.getStatus() ?? 'idle'
  }

  getSfuRelayError(): string | null {
    return this.sfuRelayErrorMessage
  }

  getParticipantAvController(): ParticipantAvController | null {
    return this.sfu?.participantAv ?? null
  }

  unpublishHostScreen(): void {
    this.sfu?.unpublishHostScreen()
  }

  syncHostScreenPublish(opts: {
    stream: MediaStream | null
    roomMode: RoomMode
    isPublisher: boolean
  }): void {
    this.sfu?.syncHostScreenPublish(opts)
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
    this.theater?.setGuestVideoElement(element)
  }

  bindHostCaptureVideo(element: HTMLVideoElement | null): void {
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
    if (handlers.onPresence) maybePush(chat.onPresence(handlers.onPresence))
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

    const theater = this.theater
    const routeTheaterMix =
      this.theaterLayoutActive && this.theaterBootstrapped && theater !== null

    this.hostScreenStreamUnsub = sfu.onRemoteStream((stream) => {
      if (routeTheaterMix && !this.isHost) {
        theater.setGuestRemote(stream)
      }
      handlers.hostScreen?.onRemoteStream?.(stream)
      this.emitDiagnosticsChange()
    })

    this.participantAvTrackUnsub = sfu.onConsumerTrack((event) => {
      if (routeTheaterMix) {
        theater.routeSfuConsumerEvent(event)
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
