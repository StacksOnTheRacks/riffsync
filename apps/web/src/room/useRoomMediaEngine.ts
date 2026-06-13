import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { RoomMode, RoomSnapshot } from '../api/roomsApi'
import type { GiphySearchResult } from '../api/giphySearchApi'
import { useStageLayoutTransition } from './stage/useStageLayoutTransition'
import type { ParticipantAvController } from './sfu/participantAvSession'
import type { ChatSessionStatus } from './sessions/ChatSession'
import type { TheaterPlaybackSnapshot } from './sessions/RoomRealtimeSdk'
import {
  acquireRoomMediaEngine,
  releaseRoomMediaEngine,
  type RoomMediaEngine,
} from './engine/RoomMediaEngine'
import { pickRoomSnapshotMediaFields } from './engine/roomSnapshotDiff'

export function useRoomMediaEngine(options: {
  wsBase: string | undefined
  canonicalRoomId: string
  roomId: string
  sessionId: string
  displayName: string
  fanToken: string | null
  room: RoomSnapshot | null | undefined
  roomMode: RoomMode
  isPublisher: boolean
  captureStream: MediaStream | null
  captureStreamRef: RefObject<MediaStream | null>
  youtubeVideoId: string | null | undefined
  announceRoomA11y: (message: string) => void
  hostPatchSuppressAnnounceUntilRef: RefObject<number>
  setRoom: Dispatch<SetStateAction<RoomSnapshot | null | undefined>>
  experimentalFeatures: boolean
}): {
  wsStatus: ChatSessionStatus
  sendJson: (payload: Record<string, unknown>) => boolean
  chat: ReturnType<RoomMediaEngine['getSnapshot']>['chat']
  chatReactions: ReturnType<RoomMediaEngine['getSnapshot']>['chatReactions']
  chatDraft: string
  setChatDraft: (draft: string) => void
  sendChat: () => void
  sendChatGif: (result: GiphySearchResult) => void
  toggleChatReaction: (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => void
  peopleShown: ReturnType<RoomMediaEngine['getSnapshot']>['peopleShown']
  chatMemberLabels: Map<string, string>
  sfuConfigAlert: string | null
  chatDrawerBanner: string | null
  chatComposeStatus: { message: string | null; disableSubmit: boolean }
  videoRelayStatus: string | null
  theaterAudioStatus: string | null
  guestRemote: MediaStream | null
  participantAvController: ParticipantAvController
  unpublishHostScreen: () => void
  theaterPlaybackSnapshot: TheaterPlaybackSnapshot
  playGuestVideo: () => Promise<void>
  playHostCapturePreview: () => Promise<void>
  bindGuestVideo: (element: HTMLVideoElement | null) => void
  bindHostCaptureVideo: (element: HTMLVideoElement | null) => void
  stageParticipantTiles: ReturnType<RoomMediaEngine['getSnapshot']>['stageParticipantTiles']
  stageLayoutUpdating: boolean
} {
  const {
    wsBase,
    canonicalRoomId,
    roomId,
    sessionId,
    displayName,
    fanToken,
    room,
    roomMode,
    isPublisher,
    captureStream,
    captureStreamRef,
    youtubeVideoId,
    announceRoomA11y,
    hostPatchSuppressAnnounceUntilRef,
    setRoom,
    experimentalFeatures,
  } = options

  const engine = useMemo(() => acquireRoomMediaEngine(roomId), [roomId])

  useEffect(() => {
    return () => releaseRoomMediaEngine(roomId)
  }, [roomId])

  const subscribe = useCallback((onStoreChange: () => void) => engine.subscribe(onStoreChange), [engine])
  const getSnapshot = useCallback(() => engine.getSnapshot(), [engine])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const announceRoomA11yRef = useRef(announceRoomA11y)
  useEffect(() => {
    announceRoomA11yRef.current = announceRoomA11y
  }, [announceRoomA11y])

  const sessionMountedRef = useRef(false)

  useEffect(() => {
    sessionMountedRef.current = false
  }, [engine])

  // Keep the latest room snapshot in a ref so the mount effect can read it for its
  // initial join without depending on the room object's identity. The 5s poll replaces
  // `room` with a fresh object every tick; depending on it here would tear down and
  // rebuild the entire SFU/WS session on every poll. Post-mount updates flow through
  // the diffed `engine.applyRoomSnapshot` effect below instead.
  const roomRef = useRef(room)
  useEffect(() => {
    roomRef.current = room
  }, [room])

  const roomAvailable = Boolean(room) && Boolean(canonicalRoomId)

  useEffect(() => {
    if (!roomAvailable || sessionMountedRef.current) return
    const initialRoom = roomRef.current
    if (!initialRoom) return
    sessionMountedRef.current = true

    engine.mount(initialRoom, {
      roomId,
      canonicalRoomId,
      sessionId,
      displayName,
      fanToken,
      isPublisher,
      experimentalFeatures,
      wsBase,
      captureStreamRef,
      announceRoomA11y: (message) => announceRoomA11yRef.current(message),
      hostPatchSuppressAnnounceUntilRef,
      onRoomModePatch: (nextMode) => {
        setRoom((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            roomMode: nextMode,
            ...(nextMode === 'videoChat' ? { broadcastCaptureActive: false } : {}),
          }
        })
      },
      onAvDisabledPatch: (avDisabled) => {
        setRoom((prev) => (prev ? { ...prev, avDisabled } : prev))
      },
    })

    return () => {
      sessionMountedRef.current = false
      engine.teardown()
    }
  // `room` and `fanToken` are intentionally omitted: the initial room is read from a ref,
  // post-mount room updates flow through engine.applyRoomSnapshot, and fanToken refreshes
  // go through engine.setFanToken. Including either here would churn the SFU/WS session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canonicalRoomId,
    displayName,
    engine,
    hostPatchSuppressAnnounceUntilRef,
    isPublisher,
    experimentalFeatures,
    roomAvailable,
    roomId,
    sessionId,
    setRoom,
    wsBase,
    captureStreamRef,
  ])

  const lastAppliedMediaFieldsRef = useRef<string>('')

  useEffect(() => {
    if (!room) return
    const fields = pickRoomSnapshotMediaFields(room)
    const key = fields
      ? `${fields.roomMode}|${fields.avDisabled}|${fields.youtubeVideoId}|${fields.broadcastCaptureActive}`
      : ''
    if (key === lastAppliedMediaFieldsRef.current) return
    lastAppliedMediaFieldsRef.current = key
    engine.applyRoomSnapshot(room)
  }, [engine, room])

  useEffect(() => {
    engine.setCaptureStream(captureStream)
  }, [captureStream, engine])

  useEffect(() => {
    engine.setRoomMode(roomMode)
  }, [engine, roomMode])

  const avDisabled = room?.avDisabled ?? false
  useEffect(() => {
    engine.setAvDisabled(avDisabled)
  }, [avDisabled, engine])

  useEffect(() => {
    engine.setYoutubeVideoId(youtubeVideoId)
  }, [engine, youtubeVideoId])

  useEffect(() => {
    engine.setFanToken(fanToken)
  }, [engine, fanToken])

  const sendJson = useCallback(
    (payload: Record<string, unknown>) => engine.sendControl(payload),
    [engine],
  )

  const setChatDraft = useCallback((draft: string) => engine.setChatDraft(draft), [engine])
  const sendChat = useCallback(() => engine.sendChat(fanToken), [engine, fanToken])
  const sendChatGif = useCallback(
    (result: GiphySearchResult) => engine.sendChatGif(fanToken, result),
    [engine, fanToken],
  )
  const toggleChatReaction = useCallback(
    (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => {
      engine.toggleChatReaction(fanToken, sessionId, messageId, emoji, reactionAction)
    },
    [engine, fanToken, sessionId],
  )

  const unpublishHostScreen = useCallback(() => engine.unpublishHostScreen(), [engine])
  const playGuestVideo = useCallback(() => engine.playGuestVideo(), [engine])
  const playHostCapturePreview = useCallback(() => engine.playHostCapturePreview(), [engine])
  const bindGuestVideo = useCallback(
    (element: HTMLVideoElement | null) => engine.bindGuestVideo(element),
    [engine],
  )
  const bindHostCaptureVideo = useCallback(
    (element: HTMLVideoElement | null) => engine.bindHostCaptureVideo(element),
    [engine],
  )

  const chatMemberLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of snapshot.peopleShown) {
      m.set(p.sessionId, p.displayName)
    }
    return m
  }, [snapshot.peopleShown])

  const stageLayoutUpdating = useStageLayoutTransition(roomMode, snapshot.stageParticipantTiles.length)

  const noopParticipantAvController: ParticipantAvController = {
    getState: () => ({
      cameraEnabled: false,
      micEnabled: false,
      micMuted: false,
      canPublish: false,
      needsProducerToken: false,
      error: null,
      busy: false,
    }),
    getLocalPreviewStream: () => null,
    subscribe: () => () => undefined,
    refreshPublishGate: () => undefined,
    attachSession: () => undefined,
    resetOnReconnect: () => undefined,
    enableCamera: async () => undefined,
    disableCamera: () => undefined,
    enableMic: async () => undefined,
    disableMic: () => undefined,
    toggleMicMute: () => undefined,
    teardownPublishing: () => undefined,
    failPublish: () => undefined,
    clearError: () => undefined,
  }

  return {
    wsStatus: snapshot.wsStatus,
    sendJson,
    chat: snapshot.chat,
    chatReactions: snapshot.chatReactions,
    chatDraft: snapshot.chatDraft,
    setChatDraft,
    sendChat,
    sendChatGif,
    toggleChatReaction,
    peopleShown: snapshot.peopleShown,
    chatMemberLabels,
    sfuConfigAlert: snapshot.drawerPresentation.sfuConfigAlert,
    chatDrawerBanner: snapshot.drawerPresentation.chatDrawerBanner,
    chatComposeStatus: snapshot.drawerPresentation.chatComposeStatus,
    videoRelayStatus: snapshot.drawerPresentation.videoRelayStatus,
    theaterAudioStatus: snapshot.drawerPresentation.theaterAudioStatus,
    guestRemote: snapshot.guestRemote,
    participantAvController: snapshot.participantAvController ?? noopParticipantAvController,
    unpublishHostScreen,
    theaterPlaybackSnapshot: snapshot.theaterPlaybackSnapshot,
    playGuestVideo,
    playHostCapturePreview,
    bindGuestVideo,
    bindHostCaptureVideo,
    stageParticipantTiles: snapshot.stageParticipantTiles,
    stageLayoutUpdating,
  }
}
