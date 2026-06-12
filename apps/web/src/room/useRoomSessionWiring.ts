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
import { useChatSession } from './useChatSession'
import { useSfuMediaSession } from './useSfuMediaSession'
import { useTheaterPlayback } from './useTheaterPlayback'
import {
  applyChatReactionEvent,
  canAcceptReactionAdd,
  type ReactionsByMessage,
} from './chatReactions'
import { createChatMessageId } from './chatMessageId'
import { avDisabledAnnounceCopy, roomModeAnnounceCopy } from './hostRoomControls'
import type { GiphySearchResult } from '../api/giphySearchApi'
import type { SfuConsumerTrackEvent } from './sfu/mediasoupSharing'
import {
  applyParticipantAvConsumerEvent,
  type ParticipantAvVideoConsumer,
} from './stage/participantAvConsumers'
import { buildStageParticipantTiles } from './stage/stageParticipantTiles'
import { useStageLayoutTransition } from './stage/useStageLayoutTransition'
import type { ChatLine, PresenceMember } from './roomPageTypes'

export function useRoomSessionWiring(options: {
  wsBase: string | undefined
  canonicalRoomId: string
  roomId: string
  sessionId: string
  displayName: string
  fanToken: string | null
  room: RoomSnapshot | null | undefined
  avDisabled: boolean
  roomMode: RoomMode
  isPublisher: boolean
  captureStream: MediaStream | null
  captureStreamRef: RefObject<MediaStream | null>
  youtubeVideoId: string | null | undefined
  announceRoomA11y: (message: string) => void
  hostPatchSuppressAnnounceUntilRef: RefObject<number>
  setRoom: Dispatch<SetStateAction<RoomSnapshot | null | undefined>>
}): {
  wsStatus: ReturnType<typeof useChatSession>['status']
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
  sfuRoomErr: string | null
  guestRemote: MediaStream | null
  participantAvController: ReturnType<typeof useSfuMediaSession>['participantAvController']
  unpublishHostScreen: () => void
  theaterPlaybackSnapshot: ReturnType<typeof useTheaterPlayback>['snapshot']
  playGuestVideo: () => Promise<void>
  playHostCapturePreview: () => Promise<void>
  bindGuestVideo: (element: HTMLVideoElement | null) => void
  bindHostCaptureVideo: (element: HTMLVideoElement | null) => void
  participantAvVideoConsumers: Map<string, ParticipantAvVideoConsumer>
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
    avDisabled,
    roomMode,
    isPublisher,
    captureStream,
    captureStreamRef,
    youtubeVideoId,
    announceRoomA11y,
    hostPatchSuppressAnnounceUntilRef,
    setRoom,
  } = options

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

  const prevRoomModeRef = useRef<RoomMode>('theater')
  const prevAvDisabledRef = useRef<boolean | null>(null)
  const icePromiseByRoomRef = useRef<{ roomId: string; promise: Promise<RTCIceServer[]> } | null>(
    null,
  )

  const theaterMixEnabled = roomMode === 'theater'

  const getIceServers = useCallback((): Promise<RTCIceServer[]> => {
    let entry = icePromiseByRoomRef.current
    if (!entry || entry.roomId !== roomId) {
      entry = { roomId, promise: fetchRtcIceServers() }
      icePromiseByRoomRef.current = entry
    }
    return entry.promise
  }, [roomId])

  const { status: wsStatus, sendJson: wsSendJson, session: chatSession } = useChatSession({
    url: wsBase,
    roomId: canonicalRoomId,
    sessionId,
    displayName,
    accessToken: fanToken,
    enabled: Boolean(wsBase && canonicalRoomId && room),
  })

  const onParticipantAvConsumerTrack = useCallback((event: SfuConsumerTrackEvent) => {
    setParticipantAvVideoConsumers((prev) => applyParticipantAvConsumerEvent(prev, event))
  }, [])

  const {
    sfuError: sfuRoomErr,
    guestRemote,
    participantAvController,
    session: sfuMediaSession,
    unpublishHostScreen,
  } = useSfuMediaSession({
    enabled: Boolean(canonicalRoomId && sessionId && room),
    apiBaseUrl: getPublicApiBaseUrl(),
    roomId: canonicalRoomId,
    sessionId,
    accessToken: fanToken,
    fanToken,
    avDisabled,
    getIceServers,
    getHostScreenStream: () => captureStreamRef.current,
    captureStream,
    roomMode,
    isPublisher,
    onConsumerTrack: onParticipantAvConsumerTrack,
    onParticipantAvConsumersClear: () => {
      setParticipantAvVideoConsumers(new Map())
    },
  })

  const {
    snapshot: theaterPlaybackSnapshot,
    playGuestVideo,
    playHostCapturePreview,
    bindGuestVideo,
    bindHostCaptureVideo,
  } = useTheaterPlayback({
    enabled: theaterMixEnabled,
    isPublisher,
    avDisabled,
    guestRemote,
    captureStream,
    sfuSession: sfuMediaSession,
    youtubeVideoId,
  })

  useEffect(() => {
    const unsubs = [
      chatSession.onChatText((line) => {
        setChat((prev) => [...prev, line])
      }),
      chatSession.onChatGif((line) => {
        setChat((prev) => [...prev, line])
      }),
      chatSession.onChatReaction((event) => {
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
      }),
      chatSession.onPresence((event) => {
        setPresenceRoster(event)
      }),
      chatSession.onShareState((event) => {
        if (event.state !== 'stopped') return
        // Same host_screen-only policy as RoomRealtimeSdk.wireMediaPolicyCallbacks.
        sfuMediaSession.handleShareStateStopped(isPublisher)
      }),
      chatSession.onRoomMode((event) => {
        setRoom((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            roomMode: event.roomMode,
            ...(event.roomMode === 'videoChat' ? { broadcastCaptureActive: false } : {}),
          }
        })
        if (Date.now() > (hostPatchSuppressAnnounceUntilRef.current ?? 0)) {
          announceRoomA11y(roomModeAnnounceCopy(event.roomMode))
        }
      }),
      chatSession.onAvDisabled((event) => {
        setRoom((prev) => (prev ? { ...prev, avDisabled: event.avDisabled } : prev))
        if (Date.now() > (hostPatchSuppressAnnounceUntilRef.current ?? 0)) {
          announceRoomA11y(avDisabledAnnounceCopy(event.avDisabled))
        }
      }),
    ]
    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [
    announceRoomA11y,
    chatSession,
    hostPatchSuppressAnnounceUntilRef,
    isPublisher,
    sessionId,
    setRoom,
    sfuMediaSession,
  ])

  useEffect(() => {
    if (!roomId || !room || wsStatus !== 'open') return
    void getIceServers().catch(() => undefined)
  }, [roomId, room, wsStatus, getIceServers])

  const sendJson = useCallback(
    (payload: Record<string, unknown>) => {
      wsSendJson(payload)
    },
    [wsSendJson],
  )

  useEffect(() => {
    const previousMode = prevRoomModeRef.current
    prevRoomModeRef.current = roomMode
    sfuMediaSession.handleRoomModeTransition(previousMode, roomMode, isPublisher)
  }, [isPublisher, roomMode, sfuMediaSession])

  useEffect(() => {
    const previous = prevAvDisabledRef.current
    prevAvDisabledRef.current = avDisabled
    if (previous === null || !avDisabled || previous === avDisabled) return
    sfuMediaSession.handleAvDisabledKillSwitch()
  }, [avDisabled, sfuMediaSession])

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

  const participantAvPublishState = participantAvController.getState()
  const stageParticipantTiles = buildStageParticipantTiles({
    roster: peopleShown,
    videoConsumers: participantAvVideoConsumers,
    ownSessionId: sessionId,
    localCameraOn: participantAvPublishState.cameraEnabled,
    localPreviewStream: participantAvController.getLocalPreviewStream(),
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
    sfuRoomErr,
    guestRemote,
    participantAvController,
    unpublishHostScreen,
    theaterPlaybackSnapshot,
    playGuestVideo,
    playHostCapturePreview,
    bindGuestVideo,
    bindHostCaptureVideo,
    participantAvVideoConsumers,
    stageParticipantTiles,
    stageLayoutUpdating,
  }
}
