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
  peopleShown: ReturnType<RoomMediaEngine['buildPeopleShown']>
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
  } = options

  const engineRef = useRef<RoomMediaEngine | null>(null)
  const mountedRoomIdRef = useRef<string | null>(null)
  const joinedRef = useRef(false)

  if (!engineRef.current || engineRef.current.roomId !== roomId) {
    if (engineRef.current && mountedRoomIdRef.current) {
      releaseRoomMediaEngine(mountedRoomIdRef.current)
    }
    engineRef.current = acquireRoomMediaEngine(roomId)
    mountedRoomIdRef.current = roomId
    joinedRef.current = false
  }

  const engine = engineRef.current

  const subscribe = useCallback((onStoreChange: () => void) => engine.subscribe(onStoreChange), [engine])
  const getSnapshot = useCallback(() => engine.getSnapshot(), [engine])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const announceRoomA11yRef = useRef(announceRoomA11y)
  useEffect(() => {
    announceRoomA11yRef.current = announceRoomA11y
  }, [announceRoomA11y])

  useEffect(() => {
    if (!room || !canonicalRoomId) return
    if (joinedRef.current) return
    joinedRef.current = true

    engine.mount(room, {
      roomId,
      canonicalRoomId,
      sessionId,
      displayName,
      fanToken,
      isPublisher,
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
      joinedRef.current = false
      releaseRoomMediaEngine(roomId)
      if (engineRef.current?.roomId === roomId) {
        engineRef.current = null
        mountedRoomIdRef.current = null
      }
    }
  }, [
    canonicalRoomId,
    displayName,
    engine,
    hostPatchSuppressAnnounceUntilRef,
    isPublisher,
    roomId,
    sessionId,
    setRoom,
    wsBase,
    captureStreamRef,
    room,
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

  useEffect(() => {
    if (room) {
      engine.setAvDisabled(room.avDisabled)
    }
  }, [engine, room?.avDisabled])

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

  const peopleShown = useMemo(() => engine.buildPeopleShown(), [engine, snapshot.participantAvPublishTick, snapshot.presenceRoster])

  const chatMemberLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of peopleShown) {
      m.set(p.sessionId, p.displayName)
    }
    return m
  }, [peopleShown])

  const drawerPresentation = engine.getDrawerPresentation(isPublisher)
  const stageLayoutUpdating = useStageLayoutTransition(roomMode, snapshot.stageParticipantTiles.length)

  const participantAvController = engine.getParticipantAvController()
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
    chatDraft: engine.getChatDraft(),
    setChatDraft,
    sendChat,
    sendChatGif,
    toggleChatReaction,
    peopleShown,
    chatMemberLabels,
    sfuConfigAlert: drawerPresentation.sfuConfigAlert,
    chatDrawerBanner: drawerPresentation.chatDrawerBanner,
    chatComposeStatus: drawerPresentation.chatComposeStatus,
    videoRelayStatus: drawerPresentation.videoRelayStatus,
    theaterAudioStatus: drawerPresentation.theaterAudioStatus,
    guestRemote: snapshot.guestRemote,
    participantAvController: participantAvController ?? noopParticipantAvController,
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
