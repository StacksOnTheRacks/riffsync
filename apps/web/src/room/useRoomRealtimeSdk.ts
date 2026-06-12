import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { RoomMode, RoomSnapshot } from '../api/roomsApi'
import { fetchRtcIceServers } from '../config/fetchRtcIceServers'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import {
  applyChatReactionEvent,
  canAcceptReactionAdd,
  type ReactionsByMessage,
} from './chatReactions'
import { createChatMessageId } from './chatMessageId'
import { avDisabledAnnounceCopy, roomModeAnnounceCopy } from './hostRoomControls'
import type { GiphySearchResult } from '../api/giphySearchApi'
import type { SfuConsumerTrackEvent } from './sfu/mediasoupSharing'
import { selectDrawerPresentation } from './drawerErrorPresentation'
import {
  applyParticipantAvConsumerEvent,
  type ParticipantAvVideoConsumer,
} from './stage/participantAvConsumers'
import { buildStageParticipantTiles } from './stage/stageParticipantTiles'
import { useStageLayoutTransition } from './stage/useStageLayoutTransition'
import type { ChatLine, PresenceMember } from './roomPageTypes'
import {
  RoomRealtimeSdk,
  type RoomRealtimeDiagnostics,
  type TheaterPlaybackSnapshot,
} from './sessions/RoomRealtimeSdk'
import type { ChatSessionStatus } from './sessions/ChatSession'
import type { ParticipantAvController } from './sfu/participantAvSession'

export function useRoomRealtimeSdk(options: {
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
  sendJson: (payload: Record<string, unknown>) => void
  chat: ChatLine[]
  chatReactions: ReactionsByMessage
  chatDraft: string
  setChatDraft: (draft: string) => void
  sendChat: () => void
  sendChatGif: (result: GiphySearchResult) => void
  toggleChatReaction: (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => void
  peopleShown: PresenceMember[]
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
  stageParticipantTiles: ReturnType<typeof buildStageParticipantTiles>
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

  const [sdk] = useState(() => new RoomRealtimeSdk())
  const [wsStatus, setWsStatus] = useState<ChatSessionStatus>('idle')
  const [realtimeDiagnostics, setRealtimeDiagnostics] = useState<RoomRealtimeDiagnostics | null>(
    null,
  )
  const [guestRemote, setGuestRemote] = useState<MediaStream | null>(null)
  const [theaterPlaybackSnapshot, setTheaterPlaybackSnapshot] = useState<TheaterPlaybackSnapshot>(
    () => sdk.getTheaterSnapshot(),
  )
  const [chat, setChat] = useState<ChatLine[]>([])
  const [chatReactions, setChatReactions] = useState<ReactionsByMessage>({})
  const [chatDraft, setChatDraft] = useState('')
  const [participantAvVideoConsumers, setParticipantAvVideoConsumers] = useState(
    () => new Map<string, ParticipantAvVideoConsumer>(),
  )
  const [presenceRoster, setPresenceRoster] = useState<{
    roomId: string
    members: PresenceMember[]
  }>(() => ({
    roomId: '',
    members: [],
  }))
  const [participantAvPublishTick, setParticipantAvPublishTick] = useState(0)

  void participantAvPublishTick

  const icePromiseByRoomRef = useRef<{ roomId: string; promise: Promise<RTCIceServer[]> } | null>(
    null,
  )
  const announceRoomA11yRef = useRef(announceRoomA11y)

  useEffect(() => {
    announceRoomA11yRef.current = announceRoomA11y
  }, [announceRoomA11y])

  const getIceServers = useCallback((): Promise<RTCIceServer[]> => {
    let entry = icePromiseByRoomRef.current
    if (!entry || entry.roomId !== roomId) {
      entry = { roomId, promise: fetchRtcIceServers() }
      icePromiseByRoomRef.current = entry
    }
    return entry.promise
  }, [roomId])

  useEffect(() => {
    if (!room || !canonicalRoomId) {
      sdk.teardown()
      return
    }

    sdk.join(canonicalRoomId, {
      roomSnapshot: room,
      sessionId,
      displayName,
      accessToken: fanToken,
      wsUrl: wsBase,
      apiBaseUrl: getPublicApiBaseUrl(),
      isHost: isPublisher,
      getIceServers,
      getHostScreenStream: () => captureStreamRef.current,
      youtubeVideoId,
      roomControlHandlers: {
        onChatText: (line) => {
          setChat((prev) => [...prev, line])
        },
        onChatGif: (line) => {
          setChat((prev) => [...prev, line])
        },
        onChatReaction: (event) => {
          setChatReactions((prev) =>
            applyChatReactionEvent(
              prev,
              event.messageId,
              event.emoji,
              event.action,
              event.sessionId,
              sessionId,
            ),
          )
        },
        onPresence: (event) => {
          setPresenceRoster(event)
        },
        onRoomModeUi: (event) => {
          setRoom((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              roomMode: event.roomMode,
              ...(event.roomMode === 'videoChat' ? { broadcastCaptureActive: false } : {}),
            }
          })
          if (Date.now() > (hostPatchSuppressAnnounceUntilRef.current ?? 0)) {
            announceRoomA11yRef.current(roomModeAnnounceCopy(event.roomMode))
          }
        },
        onAvDisabledUi: (event) => {
          setRoom((prev) => (prev ? { ...prev, avDisabled: event.avDisabled } : prev))
          if (Date.now() > (hostPatchSuppressAnnounceUntilRef.current ?? 0)) {
            announceRoomA11yRef.current(avDisabledAnnounceCopy(event.avDisabled))
          }
        },
      },
      onDiagnosticsChange: (diagnostics) => {
        queueMicrotask(() => {
          setWsStatus(sdk.getChatStatus())
          setRealtimeDiagnostics(diagnostics)
        })
      },
    })

    sdk.subscribe({
      hostScreen: {
        onRemoteStream: (stream) => {
          if (!isPublisher) setGuestRemote(stream)
        },
      },
      participantAv: {
        onConsumerTrack: (event: SfuConsumerTrackEvent) => {
          setParticipantAvVideoConsumers((prev) => applyParticipantAvConsumerEvent(prev, event))
        },
        onConsumersClear: () => {
          setParticipantAvVideoConsumers(new Map())
        },
      },
    })

    const theaterUnsub = sdk.onTheaterSnapshotChange(setTheaterPlaybackSnapshot)
    queueMicrotask(() => {
      setTheaterPlaybackSnapshot(sdk.getTheaterSnapshot())
      setRealtimeDiagnostics(sdk.getDiagnostics())
    })
    const chatPoll = window.setInterval(() => {
      setWsStatus(sdk.getChatStatus())
    }, 500)

    return () => {
      window.clearInterval(chatPoll)
      theaterUnsub()
      sdk.teardown()
      setGuestRemote(null)
      setWsStatus('idle')
      setRealtimeDiagnostics(null)
    }
  }, [
    canonicalRoomId,
    captureStreamRef,
    displayName,
    fanToken,
    getIceServers,
    isPublisher,
    room,
    sdk,
    sessionId,
    wsBase,
    youtubeVideoId,
    hostPatchSuppressAnnounceUntilRef,
    setRoom,
  ])

  useEffect(() => {
    sdk.setCaptureStreamForTheater(captureStream)
  }, [captureStream, sdk])

  useEffect(() => {
    sdk.setYoutubeVideoIdForTheater(youtubeVideoId)
  }, [sdk, youtubeVideoId])

  useEffect(() => {
    if (!room || !canonicalRoomId) return
    sdk.syncHostScreenPublish({
      stream: captureStream,
      roomMode,
      isPublisher,
    })
  }, [captureStream, canonicalRoomId, isPublisher, room, roomMode, sdk])

  const participantAvController = sdk.getParticipantAvController()
  useEffect(() => {
    if (!participantAvController) return
    return participantAvController.subscribe(() => {
      setParticipantAvPublishTick((n) => n + 1)
    })
  }, [participantAvController, sdk])

  useEffect(() => {
    return () => {
      sdk.getParticipantAvController()?.teardownPublishing()
    }
  }, [sdk])

  const sendJson = useCallback(
    (payload: Record<string, unknown>) => {
      sdk.sendControl(payload)
    },
    [sdk],
  )

  const unpublishHostScreen = useCallback(() => {
    sdk.unpublishHostScreen()
  }, [sdk])

  const playGuestVideo = useCallback(() => sdk.playGuestVideo(), [sdk])
  const playHostCapturePreview = useCallback(() => sdk.playHostCapturePreview(), [sdk])
  const bindGuestVideo = useCallback(
    (element: HTMLVideoElement | null) => sdk.bindGuestVideo(element),
    [sdk],
  )
  const bindHostCaptureVideo = useCallback(
    (element: HTMLVideoElement | null) => sdk.bindHostCaptureVideo(element),
    [sdk],
  )

  const peopleShown = useMemo(() => {
    const roster = presenceRoster.roomId === canonicalRoomId ? presenceRoster.members : []
    const merged = new Map<string, PresenceMember>()
    for (const m of roster) {
      merged.set(m.sessionId, m)
    }
    if (!merged.has(sessionId)) {
      merged.set(sessionId, { sessionId, displayName, isHost: isPublisher })
    }
    return [...merged.values()].sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
    })
  }, [presenceRoster.members, presenceRoster.roomId, canonicalRoomId, sessionId, displayName, isPublisher])

  const chatMemberLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of peopleShown) {
      m.set(p.sessionId, p.displayName)
    }
    return m
  }, [peopleShown])

  const participantAvPublishState = participantAvController?.getState() ?? {
    cameraEnabled: false,
    micEnabled: false,
    micMuted: false,
    canPublish: false,
    needsProducerToken: false,
    error: null,
    busy: false,
  }
  const stageParticipantTiles = buildStageParticipantTiles({
    roster: peopleShown,
    videoConsumers: participantAvVideoConsumers,
    ownSessionId: sessionId,
    localCameraOn: participantAvPublishState.cameraEnabled,
    localPreviewStream: participantAvController?.getLocalPreviewStream() ?? null,
  })

  const stageLayoutUpdating = useStageLayoutTransition(roomMode, stageParticipantTiles.length)

  const sendChat = useCallback(() => {
    if (!fanToken) return
    const txt = chatDraft.trim()
    if (!txt) return
    sendJson({ action: 'chat', text: txt, messageId: createChatMessageId() })
    setChatDraft('')
  }, [chatDraft, fanToken, sendJson])

  const sendChatGif = useCallback(
    (result: GiphySearchResult) => {
      if (!fanToken) return
      sendJson({
        action: 'chat_gif',
        messageId: createChatMessageId(),
        giphyId: result.giphyId,
        renditionUrl: result.renditionUrl,
        ...(result.title !== undefined && result.title.trim() !== '' ? { title: result.title.trim() } : {}),
        ...(result.width !== undefined ? { width: result.width } : {}),
        ...(result.height !== undefined ? { height: result.height } : {}),
      })
    },
    [fanToken, sendJson],
  )

  const sendChatReaction = useCallback(
    (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => {
      if (!fanToken) return
      const trimmedEmoji = emoji.trim()
      if (trimmedEmoji === '') return
      if (reactionAction === 'add') {
        const chips = chatReactions[messageId] ?? {}
        if (!canAcceptReactionAdd(chips, trimmedEmoji)) return
      }
      sendJson({
        action: 'react',
        messageId,
        emoji: trimmedEmoji,
        reactionAction,
      })
    },
    [chatReactions, fanToken, sendJson],
  )

  const toggleChatReaction = useCallback(
    (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => {
      sendChatReaction(messageId, emoji, reactionAction)
    },
    [sendChatReaction],
  )

  const drawerPresentation =
    realtimeDiagnostics !== null
      ? selectDrawerPresentation(realtimeDiagnostics, {
          guestShareFsm: theaterPlaybackSnapshot.guestShareFsm,
          isPublisher,
        })
      : {
          chatDrawerBanner: null,
          chatComposeStatus: { message: null, disableSubmit: false },
          videoRelayStatus: null,
          sfuConfigAlert: null,
          theaterAudioStatus: null,
        }

  const noopParticipantAvController: ParticipantAvController = {
    getState: () => participantAvPublishState,
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
    wsStatus,
    sendJson,
    chat,
    chatReactions,
    chatDraft,
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
    guestRemote: isPublisher ? null : guestRemote,
    participantAvController: participantAvController ?? noopParticipantAvController,
    unpublishHostScreen,
    theaterPlaybackSnapshot,
    playGuestVideo,
    playHostCapturePreview,
    bindGuestVideo,
    bindHostCaptureVideo,
    stageParticipantTiles,
    stageLayoutUpdating,
  }
}
