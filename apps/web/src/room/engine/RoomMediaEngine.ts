import type { RoomMode, RoomSnapshot } from '../../api/roomsApi'
import type { GiphySearchResult } from '../../api/giphySearchApi'
import { getPublicApiBaseUrl } from '../../config/apiBaseUrl'
import { fetchRtcIceServers } from '../../config/fetchRtcIceServers'
import { probeTurnReachability } from '../sfu/iceDiagnostics'
import {
  applyChatReactionEvent,
  canAcceptReactionAdd,
  type ReactionsByMessage,
} from '../chatReactions'
import { createChatMessageId } from '../chatMessageId'
import { avDisabledAnnounceCopy, roomModeAnnounceCopy } from '../hostRoomControls'
import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'
import type { ParticipantAvController } from '../sfu/participantAvSession'
import {
  applyParticipantAvConsumerEvent,
  type ParticipantAvVideoConsumer,
} from '../stage/participantAvConsumers'
import { buildStageParticipantTiles } from '../stage/stageParticipantTiles'
import { selectDrawerPresentation } from '../drawerErrorPresentation'
import type { ChatLine, PresenceMember } from '../roomPageTypes'
import {
  RoomRealtimeSdk,
  type RoomControlHandlers,
  type RoomRealtimeDiagnostics,
  type TheaterPlaybackSnapshot,
} from '../sessions/RoomRealtimeSdk'
import type { ChatSessionStatus } from '../sessions/ChatSession'
import {
  initialRoomMediaConnectionState,
  mapChatStatusToConnectionPhase,
  mapSfuStatusToConnectionPhase,
  mergeConnectionPhases,
  transitionRoomMediaConnection,
  type RoomMediaConnectionState,
} from './roomMediaEngineStateMachine'
import {
  pickRoomSnapshotMediaFields,
  roomSnapshotMediaFieldsEqual,
  type RoomSnapshotMediaFields,
} from './roomSnapshotDiff'
import { emitClientDrawerLog } from '../clientDrawerLog'

export type RoomMediaEngineSnapshot = {
  connection: RoomMediaConnectionState
  wsStatus: ChatSessionStatus
  diagnostics: RoomRealtimeDiagnostics | null
  guestRemote: MediaStream | null
  theaterPlaybackSnapshot: TheaterPlaybackSnapshot
  chat: ChatLine[]
  chatReactions: ReactionsByMessage
  participantAvVideoConsumers: Map<string, ParticipantAvVideoConsumer>
  presenceRoster: { roomId: string; members: PresenceMember[] }
  participantAvPublishTick: number
  stageParticipantTiles: ReturnType<typeof buildStageParticipantTiles>
}

export type RoomMediaEngineMountOptions = {
  roomId: string
  canonicalRoomId: string
  sessionId: string
  displayName: string
  fanToken: string | null
  isPublisher: boolean
  wsBase: string | undefined
  captureStreamRef: { current: MediaStream | null }
  announceRoomA11y: (message: string) => void
  hostPatchSuppressAnnounceUntilRef: { current: number }
  onRoomModePatch: (roomMode: RoomMode) => void
  onAvDisabledPatch: (avDisabled: boolean) => void
}

const engineRegistry = new Map<string, RoomMediaEngine>()

export function getRoomMediaEngine(roomId: string): RoomMediaEngine | undefined {
  return engineRegistry.get(roomId)
}

export function acquireRoomMediaEngine(roomId: string): RoomMediaEngine {
  let engine = engineRegistry.get(roomId)
  if (!engine) {
    engine = new RoomMediaEngine(roomId)
    engineRegistry.set(roomId, engine)
  }
  engine.refCount += 1
  return engine
}

export function releaseRoomMediaEngine(roomId: string): void {
  const engine = engineRegistry.get(roomId)
  if (!engine) return
  engine.refCount -= 1
  if (engine.refCount <= 0) {
    engine.dispose()
    engineRegistry.delete(roomId)
  }
}

/**
 * Framework-agnostic room media orchestrator. One instance per roomId; survives React
 * StrictMode double-mount via ref counting. Snapshot polls push field updates without reconnect.
 */
export class RoomMediaEngine {
  readonly roomId: string
  refCount = 0

  private readonly sdk = new RoomRealtimeSdk()
  private readonly listeners = new Set<() => void>()
  private mounted = false
  private mountOptions: RoomMediaEngineMountOptions | null = null
  private lastMediaFields: RoomSnapshotMediaFields | null = null
  private chatDraft = ''
  private captureStream: MediaStream | null = null
  private hostScreenCleanup: (() => void) | null = null
  private icePromise: Promise<RTCIceServer[]> | null = null

  private connection = initialRoomMediaConnectionState()
  private wsStatus: ChatSessionStatus = 'idle'
  private diagnostics: RoomRealtimeDiagnostics | null = null
  private guestRemote: MediaStream | null = null
  private theaterPlaybackSnapshot: TheaterPlaybackSnapshot = this.sdk.getTheaterSnapshot()
  private chat: ChatLine[] = []
  private chatReactions: ReactionsByMessage = {}
  private participantAvVideoConsumers = new Map<string, ParticipantAvVideoConsumer>()
  private presenceRoster: { roomId: string; members: PresenceMember[] } = {
    roomId: '',
    members: [],
  }
  private participantAvPublishTick = 0
  private participantAvUnsub: (() => void) | null = null
  private cachedSnapshot: RoomMediaEngineSnapshot | null = null

  constructor(roomId: string) {
    this.roomId = roomId
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot(): RoomMediaEngineSnapshot {
    if (this.cachedSnapshot) return this.cachedSnapshot

    const opts = this.mountOptions
    const peopleShown = this.buildPeopleShown()
    const participantAvController = this.sdk.getParticipantAvController()
    const participantAvPublishState = participantAvController?.getState() ?? {
      cameraEnabled: false,
      micEnabled: false,
      micMuted: false,
      canPublish: false,
      needsProducerToken: false,
      error: null,
      busy: false,
    }

    this.cachedSnapshot = {
      connection: this.connection,
      wsStatus: this.wsStatus,
      diagnostics: this.diagnostics,
      guestRemote: opts?.isPublisher ? null : this.guestRemote,
      theaterPlaybackSnapshot: this.theaterPlaybackSnapshot,
      chat: this.chat,
      chatReactions: this.chatReactions,
      participantAvVideoConsumers: this.participantAvVideoConsumers,
      presenceRoster: this.presenceRoster,
      participantAvPublishTick: this.participantAvPublishTick,
      stageParticipantTiles: buildStageParticipantTiles({
        roster: peopleShown,
        videoConsumers: this.participantAvVideoConsumers,
        ownSessionId: opts?.sessionId ?? '',
        localCameraOn: participantAvPublishState.cameraEnabled,
        localPreviewStream: participantAvController?.getLocalPreviewStream() ?? null,
      }),
    }
    return this.cachedSnapshot
  }

  mount(initialRoom: RoomSnapshot, options: RoomMediaEngineMountOptions): void {
    this.mountOptions = options
    this.mounted = true
    this.lastMediaFields = pickRoomSnapshotMediaFields(initialRoom)

    const roomControlHandlers: RoomControlHandlers = {
      onChatText: (line) => {
        this.chat = [...this.chat, line]
        this.notify()
      },
      onChatGif: (line) => {
        this.chat = [...this.chat, line]
        this.notify()
      },
      onChatReaction: (event) => {
        this.chatReactions = applyChatReactionEvent(
          this.chatReactions,
          event.messageId,
          event.emoji,
          event.action,
          event.sessionId,
          options.sessionId,
        )
        this.notify()
      },
      onPresence: (event) => {
        this.presenceRoster = event
        this.notify()
      },
      onRoomModeUi: (event) => {
        options.onRoomModePatch(event.roomMode)
        if (Date.now() > (options.hostPatchSuppressAnnounceUntilRef.current ?? 0)) {
          options.announceRoomA11y(roomModeAnnounceCopy(event.roomMode))
        }
      },
      onAvDisabledUi: (event) => {
        options.onAvDisabledPatch(event.avDisabled)
        if (Date.now() > (options.hostPatchSuppressAnnounceUntilRef.current ?? 0)) {
          options.announceRoomA11y(avDisabledAnnounceCopy(event.avDisabled))
        }
      },
    }

    this.sdk.join(options.canonicalRoomId, {
      roomSnapshot: initialRoom,
      sessionId: options.sessionId,
      displayName: options.displayName,
      accessToken: options.fanToken,
      wsUrl: options.wsBase,
      apiBaseUrl: getPublicApiBaseUrl(),
      isHost: options.isPublisher,
      getIceServers: () => this.getIceServers(),
      getHostScreenStream: () => options.captureStreamRef.current,
      youtubeVideoId: initialRoom.youtubeVideoId,
      roomControlHandlers,
      onDiagnosticsChange: (next) => {
        this.diagnostics = next
        this.wsStatus = this.sdk.getChatStatus()
        this.updateConnectionFromDiagnostics()
        this.notify()
      },
    })

    this.sdk.subscribe({
      hostScreen: {
        onRemoteStream: (stream) => {
          if (!options.isPublisher) {
            this.guestRemote = stream
            this.notify()
          }
        },
      },
      participantAv: {
        onConsumerTrack: (event: SfuConsumerTrackEvent) => {
          this.participantAvVideoConsumers = applyParticipantAvConsumerEvent(
            this.participantAvVideoConsumers,
            event,
          )
          this.notify()
        },
        onConsumersClear: () => {
          this.participantAvVideoConsumers = new Map()
          this.notify()
        },
      },
    })

    this.theaterPlaybackSnapshot = this.sdk.getTheaterSnapshot()
    this.diagnostics = this.sdk.getDiagnostics()
    this.wsStatus = this.sdk.getChatStatus()
    this.updateConnectionFromDiagnostics()

    this.participantAvUnsub?.()
    const controller = this.sdk.getParticipantAvController()
    if (controller) {
      this.participantAvUnsub = controller.subscribe(() => {
        this.participantAvPublishTick += 1
        this.notify()
      })
    }

    emitClientDrawerLog({
      drawer: 'signaling',
      event: 'engine_mount',
      outcome: 'recovered',
      detail: options.canonicalRoomId,
    })
    this.notify()
  }

  applyRoomSnapshot(room: RoomSnapshot): void {
    if (!this.mounted || !this.mountOptions) return
    const nextFields = pickRoomSnapshotMediaFields(room)
    if (roomSnapshotMediaFieldsEqual(this.lastMediaFields, nextFields)) return
    this.lastMediaFields = nextFields

    if (nextFields) {
      this.sdk.setRoomMode(nextFields.roomMode)
      this.sdk.setAvDisabled(nextFields.avDisabled)
      this.sdk.setYoutubeVideoIdForTheater(nextFields.youtubeVideoId ?? null)
    }
    this.notify()
  }

  setCaptureStream(stream: MediaStream | null): void {
    this.captureStream = stream
    this.sdk.setCaptureStreamForTheater(stream)
    this.syncHostScreenPublish()
  }

  setRoomMode(roomMode: RoomMode): void {
    if (this.lastMediaFields?.roomMode === roomMode) return
    if (this.lastMediaFields) {
      this.lastMediaFields = { ...this.lastMediaFields, roomMode }
    }
    this.sdk.setRoomMode(roomMode)
    this.syncHostScreenPublish()
    this.notify()
  }

  setAvDisabled(avDisabled: boolean): void {
    if (this.lastMediaFields?.avDisabled === avDisabled) return
    if (this.lastMediaFields) {
      this.lastMediaFields = { ...this.lastMediaFields, avDisabled }
    }
    this.sdk.setAvDisabled(avDisabled)
    this.notify()
  }

  setYoutubeVideoId(youtubeVideoId: string | null | undefined): void {
    if (this.lastMediaFields) {
      this.lastMediaFields = { ...this.lastMediaFields, youtubeVideoId }
    }
    this.sdk.setYoutubeVideoIdForTheater(youtubeVideoId ?? null)
    this.notify()
  }

  setFanToken(fanToken: string | null): void {
    if (!this.mountOptions) return
    this.sdk.updateFanToken(fanToken)
  }

  getChatDraft(): string {
    return this.chatDraft
  }

  setChatDraft(draft: string): void {
    this.chatDraft = draft
    this.notify()
  }

  sendControl(payload: Record<string, unknown>): boolean {
    return this.sdk.sendControl(payload)
  }

  sendChat(fanToken: string | null): void {
    if (!fanToken) return
    const txt = this.chatDraft.trim()
    if (!txt) return
    const sent = this.sendControl({ action: 'chat', text: txt, messageId: createChatMessageId() })
    if (sent) {
      this.chatDraft = ''
      this.notify()
    }
  }

  sendChatGif(fanToken: string | null, result: GiphySearchResult): void {
    if (!fanToken) return
    this.sendControl({
      action: 'chat_gif',
      messageId: createChatMessageId(),
      giphyId: result.giphyId,
      renditionUrl: result.renditionUrl,
      ...(result.title !== undefined && result.title.trim() !== ''
        ? { title: result.title.trim() }
        : {}),
      ...(result.width !== undefined ? { width: result.width } : {}),
      ...(result.height !== undefined ? { height: result.height } : {}),
    })
  }

  toggleChatReaction(
    fanToken: string | null,
    _sessionId: string,
    messageId: string,
    emoji: string,
    reactionAction: 'add' | 'remove',
  ): void {
    if (!fanToken) return
    const trimmedEmoji = emoji.trim()
    if (trimmedEmoji === '') return
    if (reactionAction === 'add') {
      const chips = this.chatReactions[messageId] ?? {}
      if (!canAcceptReactionAdd(chips, trimmedEmoji)) return
    }
    this.sendControl({
      action: 'react',
      messageId,
      emoji: trimmedEmoji,
      reactionAction,
    })
  }

  getParticipantAvController(): ParticipantAvController | null {
    return this.sdk.getParticipantAvController()
  }

  unpublishHostScreen(): void {
    this.sdk.unpublishHostScreen()
  }

  playGuestVideo(): Promise<void> {
    return this.sdk.playGuestVideo()
  }

  playHostCapturePreview(): Promise<void> {
    return this.sdk.playHostCapturePreview()
  }

  bindGuestVideo(element: HTMLVideoElement | null): void {
    this.sdk.bindGuestVideo(element)
  }

  bindHostCaptureVideo(element: HTMLVideoElement | null): void {
    this.sdk.bindHostCaptureVideo(element)
  }

  getDrawerPresentation(isPublisher: boolean) {
    if (this.diagnostics === null) {
      return {
        chatDrawerBanner: null,
        chatComposeStatus: { message: null, disableSubmit: false },
        videoRelayStatus: null,
        sfuConfigAlert: null,
        theaterAudioStatus: null,
      }
    }
    return selectDrawerPresentation(this.diagnostics, {
      guestShareFsm: this.theaterPlaybackSnapshot.guestShareFsm,
      isPublisher,
    })
  }

  buildPeopleShown(): PresenceMember[] {
    const opts = this.mountOptions
    if (!opts) return []
    const roster =
      this.presenceRoster.roomId === opts.canonicalRoomId ? this.presenceRoster.members : []
    const merged = new Map<string, PresenceMember>()
    for (const m of roster) {
      merged.set(m.sessionId, m)
    }
    if (!merged.has(opts.sessionId)) {
      merged.set(opts.sessionId, {
        sessionId: opts.sessionId,
        displayName: opts.displayName,
        isHost: opts.isPublisher,
      })
    }
    return [...merged.values()].sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
    })
  }

  dispose(): void {
    this.hostScreenCleanup?.()
    this.hostScreenCleanup = null
    this.participantAvUnsub?.()
    this.participantAvUnsub = null
    this.sdk.getParticipantAvController()?.teardownPublishing()
    this.sdk.teardown()
    this.mounted = false
    this.mountOptions = null
    this.guestRemote = null
    this.participantAvVideoConsumers = new Map()
    this.connection = transitionRoomMediaConnection(this.connection, 'tornDown')
    this.wsStatus = 'idle'
    this.diagnostics = null
    emitClientDrawerLog({
      drawer: 'signaling',
      event: 'engine_dispose',
      outcome: 'recovered',
    })
    this.notify()
  }

  private getIceServers(): Promise<RTCIceServer[]> {
    if (!this.icePromise) {
      this.icePromise = fetchRtcIceServers().then(async (servers) => {
        void probeTurnReachability(servers)
        return servers
      })
    }
    return this.icePromise
  }

  private syncHostScreenPublish(): void {
    this.hostScreenCleanup?.()
    const opts = this.mountOptions
    if (!opts || !this.lastMediaFields) {
      this.hostScreenCleanup = null
      return
    }
    this.hostScreenCleanup =
      this.sdk.syncHostScreenPublish({
        stream: this.captureStream,
        roomMode: this.lastMediaFields.roomMode,
        isPublisher: opts.isPublisher,
      }) ?? null
  }

  private updateConnectionFromDiagnostics(): void {
    const chatPhase = mapChatStatusToConnectionPhase(this.wsStatus)
    const sfuStatus = this.sdk.getSfuStatus?.() ?? 'idle'
    const sfuPhase = mapSfuStatusToConnectionPhase(
      sfuStatus as 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting' | 'degraded',
    )
    const merged = mergeConnectionPhases(chatPhase, sfuPhase)
    this.connection = transitionRoomMediaConnection(this.connection, merged)
  }

  private notify(): void {
    this.theaterPlaybackSnapshot = this.sdk.getTheaterSnapshot()
    this.cachedSnapshot = null
    for (const listener of this.listeners) {
      listener()
    }
  }
}
