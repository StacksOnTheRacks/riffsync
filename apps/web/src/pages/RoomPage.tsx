import { Link, useParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { RoomMode, RoomSnapshot } from '../api/roomsApi'
import {
  fetchFanProfile,
  patchFanProfileDisplayName,
  uploadFanProfileAvatar,
} from '../api/fanProfileApi'
import { fetchRoom, patchRoom } from '../api/roomsApi'
import { useCatalogEpisodeQuery } from '../catalog/catalogQueries'
import { cognitoSub } from '../auth/jwtDecode'
import { getFanAccessToken } from '../auth/fanTokens'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'
import {
  ensureGuestSession,
  FAN_DISPLAY_NAME_MAX_LEN,
  setGuestDisplayName,
} from '../session/guestSession'
import { getPublicWsUrl } from '../config/wsUrl'
import { getPublicOrigin } from '../config/publicOrigin'
import { fetchRtcIceServers } from '../config/fetchRtcIceServers'
import { SITE_DOCUMENT_TITLE, trimTabTitleSegment } from '../config/documentTitle'
import { useRoomWebSocket } from '../room/useRoomWebSocket'
import { useRoomChrome } from '../room/useRoomChrome'
import {
  announceWebrtcDebugOnRoomMount,
  summarizeEnvelope,
  webrtcDebugEnabled,
  webrtcLog,
} from '../room/webrtcDebug'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import {
  createBoundParticipantAvController,
  type ParticipantAvController,
  type ParticipantAvPublishGate,
} from '../room/sfu/participantAvSession'
import { createTheaterAudioMix } from '../room/audio/theaterAudioMix'
import {
  enteredVideoChatMode,
  parseInboundRoomMode,
  stopMediaStreamTracks,
} from '../room/roomMediaLifecycle'
import type { SfuUnifiedSessionHandle } from '../room/sfu/mediasoupSharing'
import { startSfuRoomSession } from '../room/sfu/sfuRoomSession'
import { useChatLogStickToBottom } from '../room/useChatLogStickToBottom'
import { ChatComposeMediaPicker } from '../room/ChatComposeMediaPicker'
import { isEmojiOnlyChatMessage } from '../room/chatEmojiDisplay'
import type { GiphySearchResult } from '../api/giphySearchApi'
import { parseInboundChatGifMessage } from '../room/chatGifMessage'
import { ChatReactionsStrip } from '../room/ChatReactionsStrip'
import {
  applyChatReactionEvent,
  canAcceptReactionAdd,
  type ReactionsByMessage,
} from '../room/chatReactions'
import { createChatMessageId, parseInboundChatMessageId } from '../room/chatMessageId'
import { isContinuedChatLine } from '../room/chatMessageGrouping'
import { FanAvatarThumb } from '../components/FanAvatarThumb'
import { participantAvErrorFromSfuMediaCode } from '../room/av/participantAvErrors'
import { ParticipantAvToggles } from '../room/ParticipantAvToggles'
import { HostControlBar } from '../room/HostControlBar'
import {
  avDisabledAnnounceCopy,
  formatHostRoomPatchError,
  mergeRoomPatchResult,
  roomModeAnnounceCopy,
} from '../room/hostRoomControls'
import type { SfuConsumerTrackEvent } from '../room/sfu/mediasoupSharing'
import {
  applyParticipantAvConsumerEvent,
  type ParticipantAvVideoConsumer,
} from '../room/stage/participantAvConsumers'
import { StageParticipantLayout } from '../room/stage/StageParticipantLayout'
import { buildStageParticipantTiles } from '../room/stage/stageParticipantTiles'
import { useStageLayoutTransition } from '../room/stage/useStageLayoutTransition'
import { useViewportWide } from '../room/stage/useViewportWide'

const DISPLAY_TITLE_MAX_LEN = 120

/** Shown when neither token **`wsUrl`** nor **`import.meta.env.VITE_PUBLIC_SFU_WS_URL`** resolves. */
const SFU_RELAY_URL_MISSING_MSG =
  'Video relay URL is missing. Fix: (1) Redeploy RiffSyncApi-prod so POST /v1/webrtc/sfu-token returns wsUrl (from CDK context / signaling hostname). (2) Or set VITE_PUBLIC_SFU_WS_URL in the environment when you run npm run build (Vite bakes it in then, not from S3 at runtime). For https fan sites use wss via CDK context sfuPublicWsUrl or the same Vite variable.'

type ChatTextLine = {
  kind: 'text'
  messageId: string
  sessionId: string
  text: string
  ts: number
  displayName?: string
  avatarUrl?: string
}

type ChatGifLine = {
  kind: 'gif'
  messageId: string
  sessionId: string
  giphyId: string
  renditionUrl: string
  title?: string
  width?: number
  height?: number
  ts: number
  displayName?: string
  avatarUrl?: string
}

type ChatLine = ChatTextLine | ChatGifLine

type PresenceMember = {
  sessionId: string
  displayName: string
  isHost: boolean
  avatarUrl?: string
}

function parseInboundAvatarUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed !== '' ? trimmed : undefined
}

function resolveMemberAvatarUrl(
  memberSessionId: string,
  serverAvatarUrl: string | undefined,
  mySessionId: string,
  myAvatarUrl: string | null,
): string | undefined {
  if (serverAvatarUrl) return serverAvatarUrl
  if (memberSessionId === mySessionId && myAvatarUrl) return myAvatarUrl
  return undefined
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

type GuestHostScreenFsm = 'idle' | 'verifying_media' | 'running'

function guestShareStatusLine(fsm: GuestHostScreenFsm, wsDisconnected: boolean): string | null {
  if (wsDisconnected) return 'Reconnecting chat… Video may pause briefly.'
  switch (fsm) {
    case 'idle':
      return 'Waiting for host to share…'
    case 'verifying_media':
      return 'Connecting to video relay…'
    case 'running':
      return null
    default:
      return null
  }
}

export function RoomPage() {
  const { roomId: roomIdParam } = useParams<{ roomId: string }>()
  const roomId = roomIdParam ? decodeURIComponent(roomIdParam) : ''

  const guestInitial = ensureGuestSession('room')
  const [sessionId] = useState(guestInitial.sessionId)
  const [displayName, setDisplayName] = useState(guestInitial.displayName)

  const [room, setRoom] = useState<RoomSnapshot | null | undefined>(undefined)
  const [roomErr, setRoomErr] = useState<string | null>(null)
  const catalogEpisodeIdForQuery =
    room && room !== undefined && room !== null && room.roomId === roomId
      ? room.catalogEpisodeId
      : undefined
  const { data: catalogEp } = useCatalogEpisodeQuery(catalogEpisodeIdForQuery)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [chatReactions, setChatReactions] = useState<ReactionsByMessage>({})
  const [chatDraft, setChatDraft] = useState('')
  const [patchErr, setPatchErr] = useState<string | null>(null)
  const [hostBarBusy, setHostBarBusy] = useState(false)
  const [hostBarErr, setHostBarErr] = useState<string | null>(null)
  const [participantAvVideoConsumers, setParticipantAvVideoConsumers] = useState(
    () => new Map<string, ParticipantAvVideoConsumer>(),
  )
  const [participantAvPublishTick, setParticipantAvPublishTick] = useState(0)
  const [shareHint, setShareHint] = useState<string | null>(null)
  const [captureErr, setCaptureErr] = useState<string | null>(null)
  const [sfuRoomErr, setSfuRoomErr] = useState<string | null>(null)
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null)
  const [guestRemote, setGuestRemote] = useState<MediaStream | null>(null)
  const [guestPlayHint, setGuestPlayHint] = useState(false)
  const [hostCapturePlayHint, setHostCapturePlayHint] = useState(false)
  const [presenceRoster, setPresenceRoster] = useState<{
    roomId: string
    members: PresenceMember[]
  }>(() => ({
    roomId: '',
    members: [],
  }))
  const [roomSidebarTab, setRoomSidebarTab] = useState<'chat' | 'people' | 'room' | 'profile'>(
    'chat',
  )
  const { setNowPlayingLabel } = useRoomChrome()
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameModalDraft, setRenameModalDraft] = useState('')
  const [profileDraft, setProfileDraft] = useState('')
  const [profileSaveErr, setProfileSaveErr] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  /** Local avatar for this session (chat / People) before the next server presence or chat fan-out. */
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)
  const [profileAvatarLoading, setProfileAvatarLoading] = useState(false)
  const [profileAvatarUploading, setProfileAvatarUploading] = useState(false)
  const a11yAnnouncerRef = useRef<HTMLDivElement | null>(null)
  const hostPatchSuppressAnnounceUntilRef = useRef(0)
  const [profileAvatarErr, setProfileAvatarErr] = useState<string | null>(null)
  const profileTabLoadedRef = useRef(false)
  const profileAvatarInputRef = useRef<HTMLInputElement>(null)

  const [guestFsmPollTick, setGuestFsmPollTick] = useState(0)
  const guestInboundHealthRef = useRef(false)
  const [guestShareFsmUi, setGuestShareFsmUi] = useState<GuestHostScreenFsm>('idle')
  const videoRef = useRef<HTMLVideoElement>(null)
  const hostCaptureVideoRef = useRef<HTMLVideoElement>(null)
  const guestRemoteRef = useRef<MediaStream | null>(null)
  const shareGenerationRef = useRef(0)
  const sfuSessionRef = useRef<SfuUnifiedSessionHandle | null>(null)
  const prevRoomModeRef = useRef<RoomMode>('theater')
  const prevAvDisabledRef = useRef<boolean | null>(null)
  const theaterAudioMixRef = useRef<ReturnType<typeof createTheaterAudioMix> | null>(null)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const [sfuTokenIntentTick, setSfuTokenIntentTick] = useState(0)
  const prevRoomSidebarTabRef = useRef<'chat' | 'people' | 'room' | 'profile'>('chat')
  const chatInputRef = useRef<HTMLInputElement>(null)

  const wsBase = getPublicWsUrl()
  const fanToken = getFanAccessToken()
  const roomChatTabActive =
    (!fanToken && roomSidebarTab === 'profile' ? 'chat' : roomSidebarTab) === 'chat'
  const {
    logRef: chatLogRef,
    showJumpToLatest,
    jumpToLatestLabel,
    jumpToLatest,
  } = useChatLogStickToBottom(chat.length, roomChatTabActive)
  const isPublisher = Boolean(room && fanToken && cognitoSub(fanToken) === room.hostSub)
  const avDisabled = room?.avDisabled ?? true
  const roomMode = room?.roomMode ?? 'theater'

  /** Prefer the room document id so WebSocket presence matches server fan-out even if the route param differed. */
  const canonicalRoomId = useMemo(() => room?.roomId ?? roomId, [room?.roomId, roomId])
  const theaterMixEnabled = roomMode === 'theater'

  const announceRoomA11y = useCallback((message: string) => {
    const node = a11yAnnouncerRef.current
    if (!node) return
    node.textContent = ''
    node.textContent = message
  }, [])

  const patchHostRoomFields = useCallback(
    async (patch: { roomMode?: RoomMode; avDisabled?: boolean }) => {
      if (!room || !fanToken || !isPublisher || hostBarBusy) return
      const snapshot = room
      setHostBarBusy(true)
      setHostBarErr(null)
      hostPatchSuppressAnnounceUntilRef.current = Date.now() + 3000
      setRoom({
        ...snapshot,
        ...(patch.roomMode !== undefined ? { roomMode: patch.roomMode } : {}),
        ...(patch.avDisabled !== undefined ? { avDisabled: patch.avDisabled } : {}),
      })
      try {
        const res = await patchRoom(fanToken, roomId, patch)
        setRoom((prev) => (prev ? mergeRoomPatchResult(prev, res) : prev))
        if (patch.roomMode !== undefined) {
          announceRoomA11y(roomModeAnnounceCopy(patch.roomMode))
        }
        if (patch.avDisabled !== undefined) {
          announceRoomA11y(avDisabledAnnounceCopy(patch.avDisabled))
        }
      } catch (e) {
        setRoom(snapshot)
        setHostBarErr(formatHostRoomPatchError(e))
      } finally {
        setHostBarBusy(false)
      }
    },
    [room, fanToken, isPublisher, hostBarBusy, roomId, announceRoomA11y],
  )
  useEffect(() => {
    guestRemoteRef.current = guestRemote
  }, [guestRemote])

  /** Guest inbound track liveness drives idle / verifying / running host-screen status. */

  useEffect(() => {
    if (isPublisher) {
      queueMicrotask(() => setGuestShareFsmUi('idle'))
      guestInboundHealthRef.current = false
      return undefined
    }
    queueMicrotask(() => {
      const liveVideos =
        guestRemote?.getTracks().some((t) => t.kind === 'video' && t.readyState === 'live') ?? false
      if (!guestRemote) {
        setGuestShareFsmUi('idle')
        return
      }
      setGuestShareFsmUi(
        liveVideos || guestInboundHealthRef.current ? 'running' : 'verifying_media',
      )
    })
    return undefined
  }, [guestRemote, guestFsmPollTick, isPublisher])

  useEffect(() => {
    if (isPublisher) {
      guestInboundHealthRef.current = false
      return undefined
    }
    let cancelled = false
    const tick = (): void => {
      const s = guestRemoteRef.current
      const live =
        s?.getVideoTracks().some((t) => t.kind === 'video' && t.readyState === 'live') ?? false
      guestInboundHealthRef.current = live
      if (!cancelled) setGuestFsmPollTick((n) => n + 1)
    }
    queueMicrotask(tick)
    const interval = window.setInterval(() => tick(), 2300)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isPublisher])

  useEffect(() => {
    announceWebrtcDebugOnRoomMount()
  }, [])

  useEffect(() => {
    shareGenerationRef.current = 0
    queueMicrotask(() => setGuestRemote(null))
  }, [roomId])

  const peopleShown = useMemo(() => {
    const roster = presenceRoster.roomId === canonicalRoomId ? presenceRoster.members : []
    const merged = new Map<string, PresenceMember>()
    for (const m of roster) {
      merged.set(m.sessionId, m)
    }
    if (!merged.has(sessionId)) {
      merged.set(sessionId, { sessionId, displayName, isHost: isPublisher })
    }
    const list = [...merged.values()].sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
    })
    return list
  }, [presenceRoster.members, presenceRoster.roomId, canonicalRoomId, sessionId, displayName, isPublisher])

  const viewportWide = useViewportWide()
  const avSurfacesEnabled = !avDisabled

  const chatMemberLabels = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of peopleShown) {
      m.set(p.sessionId, p.displayName)
    }
    return m
  }, [peopleShown])

  useEffect(() => {
    if (!fanToken) return
    let cancelled = false
    void fetchFanProfile(fanToken)
      .then((p) => {
        if (cancelled) return
        const dn = p.displayName?.trim()
        if (dn) {
          const applied = setGuestDisplayName(dn)
          setDisplayName(applied)
        }
        setMyAvatarUrl(p.avatarUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [fanToken])

  useEffect(() => {
    if (roomSidebarTab === 'profile' && prevRoomSidebarTabRef.current !== 'profile') {
      setProfileDraft(displayName)
      setProfileSaveErr(null)
      setProfileAvatarErr(null)
    }
    prevRoomSidebarTabRef.current = roomSidebarTab
  }, [roomSidebarTab, displayName])

  useEffect(() => {
    if (roomSidebarTab !== 'profile' || !fanToken || profileTabLoadedRef.current) return
    profileTabLoadedRef.current = true
    let cancelled = false
    setProfileAvatarLoading(true)
    setProfileAvatarErr(null)
    void fetchFanProfile(fanToken)
      .then((p) => {
        if (cancelled) return
        setProfileAvatarUrl(p.avatarUrl)
        setMyAvatarUrl(p.avatarUrl)
      })
      .catch((e) => {
        if (cancelled) return
        setProfileAvatarErr(e instanceof Error ? e.message : 'Could not load profile.')
      })
      .finally(() => {
        if (!cancelled) setProfileAvatarLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roomSidebarTab, fanToken])

  const icePromiseByRoomRef = useRef<{ roomId: string; promise: Promise<RTCIceServer[]> } | null>(null)
  const getIceServers = useCallback((): Promise<RTCIceServer[]> => {
    let entry = icePromiseByRoomRef.current
    if (!entry || entry.roomId !== roomId) {
      entry = { roomId, promise: fetchRtcIceServers() }
      icePromiseByRoomRef.current = entry
    }
    return entry.promise
  }, [roomId])

  const loadRoom = useCallback(async () => {
    if (!roomId) return
    try {
      const snap = await fetchRoom(roomId)
      setRoom(snap)
      setRoomErr(snap ? null : 'Room not found.')
    } catch (e) {
      setRoom(null)
      setRoomErr(e instanceof Error ? e.message : 'Could not load room')
    }
  }, [roomId])

  useEffect(() => {
    queueMicrotask(() => void loadRoom())
  }, [loadRoom])

  useEffect(() => {
    if (!roomId || !room) return
    const t = window.setInterval(() => {
      void loadRoom()
    }, 5000)
    return () => window.clearInterval(t)
  }, [roomId, room, loadRoom])

  useEffect(() => {
    const prev = document.title
    let next: string
    if (!roomId) {
      next = `Room · ${SITE_DOCUMENT_TITLE}`
    } else if (room === undefined && !roomErr) {
      next = `Watch party · Loading… · ${SITE_DOCUMENT_TITLE}`
    } else if (roomErr || room === null) {
      next = `Watch party · unavailable · ${SITE_DOCUMENT_TITLE}`
    } else if (!room) {
      next = `Watch party · Loading… · ${SITE_DOCUMENT_TITLE}`
    } else if (room.roomId !== roomId) {
      next = `Watch party · Loading… · ${SITE_DOCUMENT_TITLE}`
    } else {
      const r = room
      const primary =
        r.displayTitle ??
        (catalogEp?.id === r.catalogEpisodeId ? catalogEp.title : undefined) ??
        r.catalogEpisodeId ??
        'Episode'
      const label = trimTabTitleSegment(primary)
      next = `Watch party · ${label} · ${SITE_DOCUMENT_TITLE}`
    }
    document.title = next
    return () => {
      document.title = prev
    }
  }, [catalogEp, room, room?.roomId, roomErr, roomId])

  useEffect(() => {
    if (!roomId || room === undefined || room === null || room.roomId !== roomId) {
      setNowPlayingLabel(null)
      return
    }
    const label =
      room.displayTitle ??
      (catalogEp?.id === room.catalogEpisodeId ? catalogEp.title : undefined) ??
      room.catalogEpisodeId ??
      null
    setNowPlayingLabel(label)
    return () => setNowPlayingLabel(null)
  }, [catalogEp, room, roomId, setNowPlayingLabel])

  useEffect(() => {
    if (!renameModalOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRenameModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [renameModalOpen])

  const sendJsonRef = useRef<(o: Record<string, unknown>) => void>(() => {})

  const onWsMessage = useCallback(
    (data: Record<string, unknown>) => {
      const t = data.type
      if (t === 'chat' && typeof data.sessionId === 'string' && typeof data.text === 'string') {
        const messageId = parseInboundChatMessageId(data.messageId)
        if (messageId === null) return
        const ts = typeof data.ts === 'number' ? data.ts : Date.now()
        const dn = typeof data.displayName === 'string' ? data.displayName : undefined
        const avatarUrl = parseInboundAvatarUrl(data.avatarUrl)
        setChat((prev) => [
          ...prev,
          {
            kind: 'text',
            sessionId: data.sessionId as string,
            text: String(data.text),
            ts,
            messageId,
            ...(dn !== undefined && dn !== '' ? { displayName: dn } : {}),
            ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          },
        ])
        return
      }
      if (t === 'chat_gif') {
        const gifLine = parseInboundChatGifMessage(data)
        if (gifLine === null) return
        setChat((prev) => [...prev, { kind: 'gif', ...gifLine }])
        return
      }
      if (
        t === 'chat_reaction' &&
        typeof data.messageId === 'string' &&
        typeof data.emoji === 'string' &&
        (data.action === 'add' || data.action === 'remove') &&
        typeof data.sessionId === 'string'
      ) {
        const messageId = data.messageId.trim()
        const emoji = data.emoji.trim()
        if (messageId === '' || emoji === '') return
        setChatReactions((prev) =>
          applyChatReactionEvent(
            prev,
            messageId,
            emoji,
            data.action as 'add' | 'remove',
            data.sessionId as string,
            sessionId,
          ),
        )
        return
      }
      if (t === 'presence' && typeof data.roomId === 'string') {
        if (data.roomId !== canonicalRoomId) return
        const raw = data.members
        if (!Array.isArray(raw)) return
        const members: PresenceMember[] = []
        for (const m of raw) {
          if (!isRecord(m)) continue
          const sid = m.sessionId
          const dn = m.displayName
          if (typeof sid !== 'string' || typeof dn !== 'string') continue
          const avatarUrl = parseInboundAvatarUrl(m.avatarUrl)
          members.push({
            sessionId: sid,
            displayName: dn,
            isHost: Boolean(m.isHost),
            ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          })
        }
        setPresenceRoster({ roomId: data.roomId as string, members })
        return
      }
      if (t === 'share_state' && typeof data.roomId === 'string') {
        if (data.roomId !== canonicalRoomId) return
        if (isPublisher) return
        const state = data.state
        if (state !== 'stopped') return
        sfuSessionRef.current?.detachConsumerClass('host_screen')
        setGuestRemote(null)
        return
      }
      if (t === 'room_mode') {
        const nextMode = parseInboundRoomMode(data.roomMode)
        if (!nextMode) return
        setRoom((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            roomMode: nextMode,
            ...(nextMode === 'videoChat' ? { broadcastCaptureActive: false } : {}),
          }
        })
        if (Date.now() > hostPatchSuppressAnnounceUntilRef.current) {
          announceRoomA11y(roomModeAnnounceCopy(nextMode))
        }
        return
      }
      if (t === 'av_disabled' && typeof data.avDisabled === 'boolean') {
        const nextAvDisabled = data.avDisabled as boolean
        setRoom((prev) => (prev ? { ...prev, avDisabled: nextAvDisabled } : prev))
        if (Date.now() > hostPatchSuppressAnnounceUntilRef.current) {
          announceRoomA11y(avDisabledAnnounceCopy(nextAvDisabled))
        }
        return
      }
    },
    [
      isPublisher,
      canonicalRoomId,
      announceRoomA11y,
    ],
  )

  const { status: wsStatus, sendJson: wsSendJson } = useRoomWebSocket({
    url: wsBase,
    roomId: canonicalRoomId,
    sessionId,
    displayName,
    accessToken: fanToken,
    enabled: Boolean(wsBase && canonicalRoomId && room),
    onMessage: onWsMessage,
  })

  const participantAvGate = useMemo<ParticipantAvPublishGate>(
    () => ({
      wsOpen: false,
      fanToken: null,
      avDisabled: true,
    }),
    [],
  )
  const participantAvController = useMemo<ParticipantAvController>(
    () => createBoundParticipantAvController(() => participantAvGate),
    [participantAvGate],
  )

  useEffect(() => {
    /* Mutable gate snapshot for stable participant AV controller (#117). */
    Object.assign(participantAvGate, {
      wsOpen: wsStatus === 'open',
      fanToken,
      avDisabled,
      onNeedsProducerTokenChange: () => {
        // Only rebuild the whole SFU session to upgrade a consumer-only socket to a
        // producer. When the current session can already publish, the controller's
        // own syncPublish publishes on the existing send transport, so tearing down
        // (and re-establishing) the session would needlessly drop host_screen and
        // every consumer on each camera/mic toggle (guest blackouts, produce races).
        if (sfuSessionRef.current?.supportsPublish) return
        setSfuTokenIntentTick((n) => n + 1)
      },
    })
    participantAvController.refreshPublishGate()
    if (wsStatus !== 'open') {
      participantAvController.resetOnReconnect()
    }
  }, [wsStatus, fanToken, avDisabled, participantAvController, participantAvGate])

  useEffect(() => {
    return participantAvController.subscribe(() => {
      setParticipantAvPublishTick((n) => n + 1)
    })
  }, [participantAvController])

  useEffect(() => {
    return () => {
      participantAvController.teardownPublishing()
    }
  }, [participantAvController])

  void participantAvPublishTick
  const participantAvPublishState = participantAvController.getState()
  const stageParticipantTiles = buildStageParticipantTiles({
    roster: peopleShown,
    videoConsumers: participantAvVideoConsumers,
    ownSessionId: sessionId,
    localCameraOn: participantAvPublishState.cameraEnabled,
    localPreviewStream: participantAvController.getLocalPreviewStream(),
  })

  const stageLayoutUpdating = useStageLayoutTransition(roomMode, stageParticipantTiles.length)

  const onParticipantAvConsumerTrack = useCallback((event: SfuConsumerTrackEvent) => {
    setParticipantAvVideoConsumers((prev) => applyParticipantAvConsumerEvent(prev, event))
  }, [])

  useEffect(() => {
    captureStreamRef.current = captureStream
  }, [captureStream])

  /** Warm ICE early so negotiation is faster and /v1/webrtc/ice appears in Network as soon as the room is live. */
  useEffect(() => {
    if (!roomId || !room || wsStatus !== 'open') return
    void getIceServers().catch(() => undefined)
  }, [roomId, room, wsStatus, getIceServers])

  const sendJson = useCallback(
    (payload: Record<string, unknown>) => {
      if (
        webrtcDebugEnabled() &&
        payload.action === 'signaling' &&
        isRecord(payload.envelope)
      ) {
        webrtcLog('ws out', summarizeEnvelope(payload.envelope))
      }
      wsSendJson(payload)
    },
    [wsSendJson],
  )

  useEffect(() => {
    sendJsonRef.current = sendJson
  }, [sendJson])

  useEffect(() => {
    if (!theaterMixEnabled) {
      theaterAudioMixRef.current?.dispose()
      theaterAudioMixRef.current = null
      return
    }
    const mix = createTheaterAudioMix()
    theaterAudioMixRef.current = mix
    return () => {
      mix.dispose()
      theaterAudioMixRef.current = null
    }
  }, [theaterMixEnabled])

  useEffect(() => {
    theaterAudioMixRef.current?.setAvDisabled(avDisabled)
  }, [avDisabled])

  const stopHostCaptureForModeTransition = useCallback(() => {
    setHostCapturePlayHint(false)
    sfuSessionRef.current?.unpublishProducerClass('host_screen')
    setCaptureStream((prev) => {
      stopMediaStreamTracks(prev)
      return null
    })
  }, [])

  useEffect(() => {
    const previousMode = prevRoomModeRef.current
    prevRoomModeRef.current = roomMode
    if (!enteredVideoChatMode(previousMode, roomMode)) return

    if (!isPublisher) {
      sfuSessionRef.current?.detachConsumerClass('host_screen')
      queueMicrotask(() => setGuestRemote(null))
      return
    }

    if (captureStreamRef.current) {
      stopHostCaptureForModeTransition()
      queueMicrotask(() => {
        setRoom((prev) => (prev ? { ...prev, broadcastCaptureActive: false } : prev))
      })
    }
  }, [roomMode, isPublisher, stopHostCaptureForModeTransition])

  useEffect(() => {
    const previous = prevAvDisabledRef.current
    prevAvDisabledRef.current = avDisabled
    if (previous === null || !avDisabled || previous === avDisabled) return

    participantAvController.teardownPublishing()
    sfuSessionRef.current?.detachConsumerClass('participant_av')
    setParticipantAvVideoConsumers(new Map())
  }, [avDisabled, participantAvController])

  useEffect(() => {
    if (!theaterMixEnabled) return
    theaterAudioMixRef.current?.setHostVideoElement(
      isPublisher ? hostCaptureVideoRef.current : videoRef.current,
    )
  }, [theaterMixEnabled, isPublisher, captureStream, guestRemote])

  useEffect(() => {
    if (wsStatus !== 'open' || !canonicalRoomId) return
    const api = getPublicApiBaseUrl()
    if (!api) return

    const { cancel } = startSfuRoomSession({
      apiBaseUrl: api,
      roomId: canonicalRoomId,
      sessionId,
      accessToken: fanToken,
      getIceServers,
      getHostScreenStream: () => captureStreamRef.current,
      participantAv: participantAvController,
      onRemoteStream: setGuestRemote,
      onConsumerTrack: (event) => {
        onParticipantAvConsumerTrack(event)
        theaterAudioMixRef.current?.onConsumerEvent(event)
        void theaterAudioMixRef.current?.resumeIfSuspended()
      },
      assignSession: (s) => {
        sfuSessionRef.current = s
      },
      onMissingWsUrl: () => setSfuRoomErr(SFU_RELAY_URL_MISSING_MSG),
      onTokenError: (msg) => setSfuRoomErr(msg),
      onMediaError: (code, msg) => {
        if (participantAvController.getState().needsProducerToken) {
          participantAvController.failPublish(participantAvErrorFromSfuMediaCode(code))
          return
        }
        setSfuRoomErr(msg)
      },
      onConnecting: () => {
        setSfuRoomErr(null)
      },
    })
    return () => {
      sfuSessionRef.current?.unpublishProducerClass('host_screen')
      cancel()
    }
  }, [
    wsStatus,
    avDisabled,
    canonicalRoomId,
    sessionId,
    fanToken,
    getIceServers,
    sfuTokenIntentTick,
    participantAvController,
    onParticipantAvConsumerTrack,
  ])

  /** Publish or unpublish host tab capture on the existing SFU session (no full reconnect). */
  useEffect(() => {
    if (wsStatus !== 'open' || !isPublisher) return
    const session = sfuSessionRef.current
    if (!session) return

    if (roomMode === 'videoChat') {
      session.unpublishProducerClass('host_screen')
      return
    }

    const stream = captureStream
    const live = stream?.getTracks().some((track) => track.readyState === 'live') ?? false
    if (!live || !stream) {
      session.unpublishProducerClass('host_screen')
      return
    }

    let cancelled = false
    void (async () => {
      try {
        await session.ready
        if (cancelled) return
        await session.publishStream(stream, 'host_screen')
      } catch {
        /* session closed or reconnecting */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [captureStream, roomMode, wsStatus, isPublisher])

  useEffect(() => {
    if (isPublisher) return
    queueMicrotask(() => setGuestRemote(null))
  }, [isPublisher])

  useEffect(() => {
    const v = videoRef.current
    if (!v || isPublisher) return
    if (!guestRemote) {
      v.srcObject = null
      return
    }
    const playbackStream = theaterMixEnabled
      ? new MediaStream(guestRemote.getVideoTracks())
      : guestRemote
    v.srcObject = playbackStream
    let cancelled = false
    void (async () => {
      v.muted = theaterMixEnabled
      try {
        await v.play()
        if (!cancelled) setGuestPlayHint(false)
        if (theaterMixEnabled) {
          await theaterAudioMixRef.current?.resumeIfSuspended()
        }
        return
      } catch {
        /* autoplay policy often blocks unmuted remote playback */
      }
      if (!theaterMixEnabled) {
        try {
          v.muted = true
          await v.play()
          if (!cancelled) setGuestPlayHint(false)
        } catch {
          if (!cancelled) setGuestPlayHint(true)
        }
      } else if (!cancelled) {
        setGuestPlayHint(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [guestRemote, isPublisher, theaterMixEnabled])

  useEffect(() => {
    const v = hostCaptureVideoRef.current
    if (!v || !isPublisher) return
    if (!captureStream) {
      v.srcObject = null
      return
    }
    v.srcObject = captureStream
    v.muted = theaterMixEnabled
    void (async () => {
      try {
        await v.play()
        setHostCapturePlayHint(false)
        if (theaterMixEnabled) {
          theaterAudioMixRef.current?.setHostVideoElement(v)
          await theaterAudioMixRef.current?.resumeIfSuspended()
        }
      } catch {
        setHostCapturePlayHint(true)
      }
    })()
  }, [captureStream, isPublisher, theaterMixEnabled])

  const stopCapture = () => {
    setHostCapturePlayHint(false)
    const gen = shareGenerationRef.current
    sendJsonRef.current({
      action: 'share_state',
      state: 'stopped',
      ...(gen > 0 ? { shareGeneration: gen } : {}),
    })
    shareGenerationRef.current = 0
    sfuSessionRef.current?.unpublishProducerClass('host_screen')
    setCaptureStream((prev) => {
      stopMediaStreamTracks(prev)
      return null
    })
  }

  const startCapture = async () => {
    setCaptureErr(null)

    const applyStream = (stream: MediaStream) => {
      shareGenerationRef.current += 1
      setHostCapturePlayHint(false)
      sendJsonRef.current({
        action: 'share_state',
        state: 'started',
        shareGeneration: shareGenerationRef.current,
      })
      stream.getTracks().forEach((tr) => {
        tr.addEventListener('ended', () => {
          stopCapture()
        })
      })
      setCaptureStream(stream)
      webrtcLog('capture stream applied, tracks:', stream.getTracks().length)
    }

    try {
      type CaptureControllerLike = {
        setFocusBehavior: (behavior: 'focus-captured-surface' | 'no-focus-change') => void
      }
      type CaptureControllerWindow = Window & {
        CaptureController?: new () => CaptureControllerLike
      }

      const CaptureControllerCtor = (window as CaptureControllerWindow).CaptureController
      const captureController =
        typeof CaptureControllerCtor === 'function' ? new CaptureControllerCtor() : undefined

      // Chrome defaults `selfBrowserSurface` to "exclude", which omits the *current* tab from the
      // "Chrome Tab" picker—bad when the host wants to share this tab. See:
      // https://developer.chrome.com/docs/web-platform/screen-sharing-controls
      const captureOptions: Parameters<MediaDevices['getDisplayMedia']>[0] & {
        selfBrowserSurface?: 'include' | 'exclude'
        surfaceSwitching?: 'include' | 'exclude'
        controller?: CaptureControllerLike
      } = {
        video: {
          displaySurface: 'browser',
          preferCurrentTab: true,
        } as MediaTrackConstraints & {
          preferCurrentTab?: boolean
          displaySurface?: string
        },
        audio: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
      }
      if (captureController) captureOptions.controller = captureController

      const stream = await navigator.mediaDevices.getDisplayMedia(captureOptions)
      try {
        captureController?.setFocusBehavior('no-focus-change')
      } catch (e) {
        webrtcLog('CaptureController focus behavior unavailable:', e)
      }
      applyStream(stream)
      return
    } catch (eStrict) {
      webrtcLog('getDisplayMedia (tab-tuned constraints) failed, trying permissive:', eStrict)
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      applyStream(stream)
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start tab capture'
      setCaptureErr(msg)
      console.warn('[riffsync] getDisplayMedia failed — guests will not see video until share succeeds:', e)
      webrtcLog('getDisplayMedia failed', e)
    }
  }

  const saveRenameFromModal = async (): Promise<boolean> => {
    if (!room || !fanToken || !isPublisher) return false
    const t = renameModalDraft.trim()
    if (!t) {
      setPatchErr('Room name cannot be empty.')
      return false
    }
    setPatchErr(null)
    try {
      const res = await patchRoom(fanToken, roomId, { displayTitle: t })
      const nextTitle = res.displayTitle ?? t
      setRoom({
        ...room,
        version: res.version,
        catalogEpisodeId: res.catalogEpisodeId,
        youtubeVideoId: res.youtubeVideoId,
        visibility: res.visibility,
        lastActivityAt: res.lastActivityAt,
        displayTitle: nextTitle,
      })
      return true
    } catch (e) {
      setPatchErr(e instanceof Error ? e.message : 'Could not save title')
      return false
    }
  }

  const openRenameModal = () => {
    if (!room) return
    setPatchErr(null)
    setRenameModalDraft(room.displayTitle ?? catalogEp?.title ?? room.catalogEpisodeId ?? '')
    setRenameModalOpen(true)
  }

  const sendChat = () => {
    if (!fanToken) return
    const txt = chatDraft.trim()
    if (!txt) return
    sendJson({ action: 'chat', text: txt, messageId: createChatMessageId() })
    setChatDraft('')
  }

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
    [fanToken, chatReactions, sendJson],
  )

  const toggleChatReaction = useCallback(
    (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => {
      sendChatReaction(messageId, emoji, reactionAction)
    },
    [sendChatReaction],
  )

  const saveProfileDisplayName = () => {
    if (!fanToken) return
    const trimmed = profileDraft.trim().slice(0, FAN_DISPLAY_NAME_MAX_LEN)
    if (!trimmed) {
      setProfileSaveErr('Display name cannot be empty.')
      return
    }
    setProfileSaving(true)
    setProfileSaveErr(null)
    void patchFanProfileDisplayName(fanToken, trimmed)
      .then((p) => {
        const applied = setGuestDisplayName(trimmed)
        setDisplayName(applied)
        setProfileDraft(applied)
        setProfileAvatarUrl(p.avatarUrl)
        setMyAvatarUrl(p.avatarUrl)
      })
      .catch((e) => {
        setProfileSaveErr(e instanceof Error ? e.message : 'Could not save profile.')
      })
      .finally(() => {
        setProfileSaving(false)
      })
  }

  const onProfileAvatarSelected = (e: ChangeEvent<HTMLInputElement>) => {
    if (!fanToken) return
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProfileAvatarUploading(true)
    setProfileAvatarErr(null)
    void uploadFanProfileAvatar(fanToken, file)
      .then((p) => {
        setProfileAvatarUrl(p.avatarUrl)
        setMyAvatarUrl(p.avatarUrl)
      })
      .catch((err) => {
        setProfileAvatarErr(err instanceof Error ? err.message : 'Could not upload avatar.')
      })
      .finally(() => {
        setProfileAvatarUploading(false)
      })
  }

  const copyShare = async () => {
    const url = `${getPublicOrigin()}/room/${encodeURIComponent(roomId)}`
    try {
      await navigator.clipboard.writeText(url)
      setShareHint('Link copied')
    } catch {
      setShareHint(`Copy manually: ${url}`)
    }
    window.setTimeout(() => setShareHint(null), 4000)
  }

  const openCapturePlayerTab = () => {
    if (!room) return
    const url = `${getPublicOrigin()}/watch/${encodeURIComponent(room.catalogEpisodeId)}?partyCapture=1`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const playGuestVideo = async () => {
    const v = videoRef.current
    if (!v) return
    if (!theaterMixEnabled) {
      v.muted = false
    }
    try {
      await v.play()
      setGuestPlayHint(false)
      await theaterAudioMixRef.current?.resumeIfSuspended()
      return
    } catch {
      /* continue */
    }
    if (!theaterMixEnabled) {
      try {
        v.muted = true
        await v.play()
        setGuestPlayHint(false)
      } catch {
        setGuestPlayHint(true)
      }
      return
    }
    setGuestPlayHint(true)
  }

  const playHostCapturePreview = async () => {
    const v = hostCaptureVideoRef.current
    if (!v) return
    try {
      await v.play()
      setHostCapturePlayHint(false)
      if (theaterMixEnabled) {
        theaterAudioMixRef.current?.setHostVideoElement(v)
        await theaterAudioMixRef.current?.resumeIfSuspended()
      }
    } catch {
      setHostCapturePlayHint(true)
    }
  }

  if (!roomId) {
    return (
      <div className="container">
        <p>Missing room id.</p>
      </div>
    )
  }

  if (room === undefined && !roomErr) {
    return (
      <div className="container">
        <p>Loading room…</p>
      </div>
    )
  }

  if (roomErr || !room) {
    return (
      <div className="container" role="alert">
        <h1>Room</h1>
        <p>{roomErr ?? 'Room unavailable.'}</p>
        <p>
          <Link to="/lobby">← Lobby</Link>
        </p>
      </div>
    )
  }

  const backdropImageUrl = catalogEp?.backdropImageUrl?.trim()
  const viewerCount = peopleShown.length
  /** Signed-out users cannot see Profile; avoid orphan tab selection without setState-in-effect. */
  const activeSidebarTab =
    !fanToken && roomSidebarTab === 'profile' ? 'chat' : roomSidebarTab

  const guestVideoStatusSentence =
    !isPublisher ?
      guestShareStatusLine(guestShareFsmUi, Boolean(wsBase) && wsStatus !== 'open')
    : null

  return (
    <div
      className={
        backdropImageUrl ? 'riffsync-room-shell riffsync-room-shell--backdrop' : 'riffsync-room-shell'
      }
    >
      <div id="riffsync-a11y-announcer" ref={a11yAnnouncerRef} aria-live="polite" className="sr-only" />
      {backdropImageUrl ? (
        <div
          className="riffsync-room-shell__backdrop"
          style={{
            backgroundImage: `linear-gradient(
              rgb(13 17 23 / 0.88),
              rgb(13 17 23 / 0.92)
            ), url(${JSON.stringify(backdropImageUrl)})`,
            backgroundSize: 'cover,cover',
            backgroundPosition: 'center,center',
            backgroundRepeat: 'no-repeat,no-repeat',
          }}
          aria-hidden
        />
      ) : null}

      <div className="container riffsync-room-page">
        {sfuRoomErr ? (
          <p className="riffsync-room-page__host-feedback-alert" role="alert">
            {sfuRoomErr}
          </p>
        ) : null}
        <div className="riffsync-room-page__stage">
          <div className="riffsync-room-page__theater">
            <StageParticipantLayout
              roomMode={roomMode}
              tiles={stageParticipantTiles}
              layoutUpdating={stageLayoutUpdating}
              viewportWide={viewportWide}
              avSurfacesEnabled={avSurfacesEnabled}
              playback={
                isPublisher ? (
              <section className="riffsync-room-page__playback" aria-label="Your shared stream preview">
                {captureStream && hostCapturePlayHint ? (
                  <p className="riffsync-room-page__guest-actions">
                    <button type="button" className="gen-button" onClick={() => void playHostCapturePreview()}>
                      Play preview
                    </button>
                  </p>
                ) : null}
                <div className="riffsync-room-page__player-shell riffsync-room-page__player-shell--guest">
                  {captureStream ? (
                    <video
                      ref={hostCaptureVideoRef}
                      className="riffsync-room-page__guest-video"
                      playsInline
                      controls
                      muted={false}
                    />
                  ) : (
                    <div className="riffsync-room-page__host-preview-placeholder">
                      <p className="riffsync-room-page__host-preview-intro">
                        This is your presentation screen. Whatever appears here is what your guests see in the theater.
                      </p>
                      <p className="riffsync-room-page__host-preview-intro">
                        First open a source media tab by clicking <strong>Open Source Tab</strong>. Then come back
                        to this tab and click <strong>Share Source Tab</strong>. In the picker, choose the tab
                        whose title starts with <strong>Share this tab</strong>.
                      </p>
                      <div className="riffsync-room-page__center-share-buttons">
                        <button type="button" className="gen-button" onClick={openCapturePlayerTab}>
                          Open Source Tab
                        </button>
                        <button type="button" className="gen-button" onClick={() => void startCapture()}>
                          Share Source Tab
                        </button>
                        <Link
                          className="gen-button"
                          to="/how-to-host-a-watchparty"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Hosting Guide
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                {isPublisher && (captureErr || (patchErr && !renameModalOpen)) ? (
                  <div className="riffsync-room-page__host-feedback" aria-label="Host notices">
                    {patchErr && !renameModalOpen ? (
                      <p className="riffsync-room-page__host-feedback-alert" role="alert">
                        {patchErr}
                      </p>
                    ) : null}
                    {captureErr ? (
                      <p className="riffsync-room-page__host-feedback-alert" role="alert">
                        {captureErr}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : (
              <section className="riffsync-room-page__playback" aria-label="Guest playback">
                <span className="sr-only">
                  Watching the shared video stream from this room&apos;s host. If playback stays black, confirm the
                  host is sharing in another browser; use Play if prompted. If you hear no audio, check that the
                  video is not muted in the player controls.
                </span>
                {guestVideoStatusSentence ?
                  <p className="riffsync-muted" role="status">
                    {guestVideoStatusSentence}
                  </p>
                : null}
                {guestPlayHint ? (
                  <p className="riffsync-room-page__guest-actions">
                    <button type="button" className="gen-button" onClick={() => void playGuestVideo()}>
                      Play video
                    </button>
                  </p>
                ) : null}
                <div className="riffsync-room-page__player-shell riffsync-room-page__player-shell--guest">
                  {!guestRemote ? (
                    <div className="riffsync-room-page__guest-video-placeholder" role="status">
                      <p>The host is not sharing video right now.</p>
                    </div>
                  ) : null}
                  <video
                    ref={videoRef}
                    className="riffsync-room-page__guest-video"
                    playsInline
                    controls
                    muted={false}
                    hidden={!guestRemote}
                  />
                </div>
                {fanToken ? (
                  <p className="sr-only">
                    You are signed in as a guest. Only the party creator can rename the room and share video.
                  </p>
                ) : (
                  <p className="sr-only">
                    You can read chat without signing in. Sign in near the chat box to send messages.
                  </p>
                )}
              </section>
            )
              }
            />
          </div>

          <aside className="riffsync-room-page__chat-column" aria-label="Room sidebar">
            <section className="riffsync-room-page__chat" aria-label="Chat and viewers">
              {!wsBase ? (
                <p className="riffsync-room-page__ws-banner riffsync-muted" role="status">
                  Chat and viewer list require <code>VITE_PUBLIC_WS_URL</code> on this deployment.
                </p>
              ) : null}

              <div className="riffsync-room-page__chat-toolbar">
                <div className="riffsync-room-page__tabs">
                  <button
                    type="button"
                    className={`riffsync-room-page__tab${activeSidebarTab === 'chat' ? ' riffsync-room-page__tab--on' : ''}`}
                    aria-pressed={activeSidebarTab === 'chat'}
                    onClick={() => setRoomSidebarTab('chat')}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    className={`riffsync-room-page__tab${activeSidebarTab === 'people' ? ' riffsync-room-page__tab--on' : ''}`}
                    aria-pressed={activeSidebarTab === 'people'}
                    onClick={() => setRoomSidebarTab('people')}
                  >
                    People ({viewerCount})
                  </button>
                  <button
                    type="button"
                    className={`riffsync-room-page__tab${activeSidebarTab === 'room' ? ' riffsync-room-page__tab--on' : ''}`}
                    aria-pressed={activeSidebarTab === 'room'}
                    onClick={() => setRoomSidebarTab('room')}
                  >
                    Room
                  </button>
                  {fanToken ? (
                    <button
                      type="button"
                      className={`riffsync-room-page__tab${activeSidebarTab === 'profile' ? ' riffsync-room-page__tab--on' : ''}`}
                      aria-pressed={activeSidebarTab === 'profile'}
                      onClick={() => setRoomSidebarTab('profile')}
                    >
                      Profile
                    </button>
                  ) : null}
                </div>
              </div>

              {activeSidebarTab === 'chat' ? (
                <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--chat">
                  <ul ref={chatLogRef} className="riffsync-room-chat-log">
                    {chat.map((m, index) => {
                      const chatDisplayName =
                        (m.displayName && m.displayName.trim() !== ''
                          ? m.displayName
                          : chatMemberLabels.get(m.sessionId)) ??
                        `${m.sessionId.slice(0, 6)}…`
                      const chatAvatarUrl = resolveMemberAvatarUrl(
                        m.sessionId,
                        m.avatarUrl,
                        sessionId,
                        myAvatarUrl,
                      )
                      const reactionChips = chatReactions[m.messageId] ?? {}
                      const isContinued = isContinuedChatLine(chat, index)
                      const isMine = m.sessionId === sessionId
                      const rowClassName = [
                        'riffsync-room-chat-log__row',
                        isMine ? 'riffsync-room-chat-log__row--mine' : 'riffsync-room-chat-log__row--theirs',
                        isContinued ? 'riffsync-room-chat-log__row--continued' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                      const showTheirsMeta = !isMine && !isContinued
                      return (
                        <li key={m.messageId} className={rowClassName}>
                          <div className="riffsync-room-chat-log__entry">
                            {showTheirsMeta ? (
                              <div className="riffsync-room-chat-log__meta">
                                <FanAvatarThumb
                                  displayName={chatDisplayName}
                                  avatarUrl={chatAvatarUrl}
                                />
                                <span className="riffsync-room-chat-log__who-name">{chatDisplayName}</span>
                              </div>
                            ) : (
                              <span className="sr-only">{chatDisplayName}: </span>
                            )}
                            <div className="riffsync-room-chat-log__bubble">
                              {m.kind === 'gif' ? (
                                <img
                                  className="riffsync-room-chat-log__gif-img"
                                  src={m.renditionUrl}
                                  alt={m.title?.trim() || 'GIF'}
                                  loading="lazy"
                                  width={m.width}
                                  height={m.height}
                                />
                              ) : (
                                <div
                                  className={`riffsync-room-chat-log__body${isEmojiOnlyChatMessage(m.text) ? ' riffsync-room-chat-log__body--emoji-only' : ''}`}
                                >
                                  {m.text}
                                </div>
                              )}
                              <ChatReactionsStrip
                                messageId={m.messageId}
                                chips={reactionChips}
                                canReact={Boolean(fanToken)}
                                onToggleReaction={toggleChatReaction}
                              />
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
              {activeSidebarTab === 'people' ? (
                <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--people">
                  <ul className="riffsync-room-page__people-list" aria-label="People currently connected">
                    {peopleShown.map((p) => {
                      const peopleAvatarUrl = resolveMemberAvatarUrl(
                        p.sessionId,
                        p.avatarUrl,
                        sessionId,
                        myAvatarUrl,
                      )
                      return (
                        <li
                          key={p.sessionId}
                          className={`riffsync-room-page__people-row${p.isHost ? ' riffsync-room-page__people-row--host' : ''}`}
                        >
                          <span className="riffsync-room-page__person-label">
                            <FanAvatarThumb displayName={p.displayName} avatarUrl={peopleAvatarUrl} />
                            <span className="riffsync-room-page__person-name">
                              {p.isHost ? (
                                <>
                                  <strong>{p.displayName}</strong>
                                  <span className="riffsync-room-page__host-badge" aria-label="Host">
                                    Host
                                  </span>
                                </>
                              ) : (
                                p.displayName
                              )}
                              {p.sessionId === sessionId ? (
                                <span className="riffsync-muted"> · you</span>
                              ) : null}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
              {activeSidebarTab === 'room' ? (
                <div className="riffsync-room-page__tab-panel riffsync-room-page__room-panel">
                  <button type="button" className="gen-button gen-button-wide" onClick={() => void copyShare()}>
                    Copy Party Link
                  </button>
                  {isPublisher ? (
                    <button type="button" className="gen-button gen-button-wide" onClick={openRenameModal}>
                      Rename Party
                    </button>
                  ) : null}
                  {isPublisher ? (
                    <Link
                      className="gen-button gen-button-wide"
                      to="/how-to-host-a-watchparty"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Hosting Guide
                    </Link>
                  ) : null}
                  {shareHint ? <span className="riffsync-room-page__hint">{shareHint}</span> : null}
                </div>
              ) : null}
              {activeSidebarTab === 'profile' ? (
                <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--profile">
                  <p className="riffsync-muted riffsync-room-page__profile-lede">
                    This name appears in chat, the viewer list, and across devices when you&apos;re signed in.
                  </p>
                  <div className="riffsync-room-page__profile-avatar-block">
                    <span className="riffsync-room-page__profile-label" id="riffsync-profile-avatar-label">
                      Avatar
                    </span>
                    <div
                      className="riffsync-room-page__profile-avatar-preview"
                      aria-labelledby="riffsync-profile-avatar-label"
                      aria-busy={profileAvatarLoading || profileAvatarUploading}
                    >
                      {profileAvatarUrl ? (
                        <img
                          src={profileAvatarUrl}
                          alt=""
                          className="riffsync-room-page__profile-avatar-img"
                        />
                      ) : (
                        <span className="riffsync-room-page__profile-avatar-placeholder" aria-hidden>
                          ?
                        </span>
                      )}
                    </div>
                    <input
                      ref={profileAvatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="riffsync-room-page__profile-avatar-input"
                      onChange={onProfileAvatarSelected}
                    />
                    <button
                      type="button"
                      className="gen-button riffsync-room-page__profile-avatar-btn"
                      disabled={profileAvatarLoading || profileAvatarUploading}
                      onClick={() => profileAvatarInputRef.current?.click()}
                    >
                      {profileAvatarUploading
                        ? 'Uploading…'
                        : profileAvatarUrl
                          ? 'Replace image'
                          : 'Choose image'}
                    </button>
                    {profileAvatarErr ? (
                      <p className="riffsync-room-page__profile-err" role="alert">
                        {profileAvatarErr}
                      </p>
                    ) : null}
                  </div>
                  <label className="riffsync-room-page__profile-label" htmlFor="riffsync-profile-display-name">
                    Display name
                  </label>
                  <input
                    id="riffsync-profile-display-name"
                    className="riffsync-room-page__profile-field"
                    maxLength={FAN_DISPLAY_NAME_MAX_LEN}
                    value={profileDraft}
                    onChange={(e) => setProfileDraft(e.target.value)}
                    autoComplete="nickname"
                  />
                  {profileSaveErr ? (
                    <p className="riffsync-room-page__profile-err" role="alert">
                      {profileSaveErr}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="gen-button riffsync-room-page__profile-save"
                    disabled={profileSaving}
                    onClick={saveProfileDisplayName}
                  >
                    {profileSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : null}
              <div className="riffsync-room-page__sidebar-footer">
                {fanToken ? (
                  <ParticipantAvToggles
                    controller={participantAvController}
                    avDisabled={avDisabled}
                    onLocalToggleAnnounce={announceRoomA11y}
                  />
                ) : null}
                {activeSidebarTab === 'chat' ? (
                  <div className="riffsync-room-chat-compose-holder">
                    {showJumpToLatest ? (
                      <button
                        type="button"
                        className="riffsync-room-chat-jump-latest gen-button"
                        aria-label="Jump to latest messages"
                        onClick={jumpToLatest}
                      >
                        {jumpToLatestLabel}
                      </button>
                    ) : null}
                    <div
                      className={`riffsync-room-chat-compose${fanToken ? '' : ' riffsync-room-chat-compose--inactive'}`}
                    >
                      {fanToken ? (
                        <ChatComposeMediaPicker
                          draft={chatDraft}
                          onDraftChange={setChatDraft}
                          inputRef={chatInputRef}
                          accessToken={fanToken}
                          onGifSelect={sendChatGif}
                        />
                      ) : null}
                      <input
                        ref={chatInputRef}
                        type="text"
                        maxLength={2000}
                        value={fanToken ? chatDraft : ''}
                        placeholder="Say something…"
                        disabled={!fanToken}
                        onChange={(e) => {
                          if (fanToken) setChatDraft(e.target.value)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && fanToken) sendChat()
                        }}
                      />
                      <button
                        type="button"
                        className="riffsync-room-chat-compose-send gen-button"
                        disabled={!fanToken}
                        onClick={sendChat}
                      >
                        Send
                      </button>
                    </div>
                    {!fanToken ? (
                      <div
                        className="riffsync-room-chat-signin-overlay"
                        role="region"
                        aria-label="Sign in to participate in chat"
                      >
                        <button
                          type="button"
                          className="gen-button"
                          onClick={() =>
                            void startFanHostedUiSignIn(`/room/${encodeURIComponent(roomId)}`).catch(console.error)
                          }
                        >
                          Sign In to Chat
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
        {isPublisher ? (
          <HostControlBar
            roomMode={roomMode}
            avDisabled={avDisabled}
            busy={hostBarBusy}
            error={hostBarErr}
            onSelectRoomMode={(mode) => void patchHostRoomFields({ roomMode: mode })}
            onToggleAvDisabled={(next) => void patchHostRoomFields({ avDisabled: next })}
          />
        ) : null}
      </div>

      {renameModalOpen && isPublisher ? (
        <div
          className="riffsync-room-modal-overlay"
          role="presentation"
          onClick={() => setRenameModalOpen(false)}
        >
          <div
            className="riffsync-room-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="riffsync-rename-room-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="riffsync-rename-room-title" className="riffsync-room-modal__heading">
              Rename Party
            </h2>
            <p className="riffsync-room-modal__lede riffsync-muted">
              This updates the lobby listing and &quot;Now playing&quot; label for everyone in the party.
            </p>
            <div className="riffsync-room-modal__form">
              <label className="riffsync-room-modal__label" htmlFor="riffsync-rename-room-input">
                Room name / now playing
              </label>
              <input
                id="riffsync-rename-room-input"
                className="riffsync-room-modal__field"
                maxLength={DISPLAY_TITLE_MAX_LEN}
                value={renameModalDraft}
                onChange={(e) => setRenameModalDraft(e.target.value)}
                autoComplete="off"
                autoFocus
              />
              {patchErr ? (
                <p className="riffsync-room-modal__err" role="alert">
                  {patchErr}
                </p>
              ) : null}
            </div>
            <div className="riffsync-room-modal__actions">
              <button
                type="button"
                className="gen-button gen-button--ghost"
                onClick={() => {
                  setPatchErr(null)
                  setRenameModalOpen(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gen-button"
                onClick={() =>
                  void saveRenameFromModal().then((ok) => {
                    if (ok) {
                      setPatchErr(null)
                      setRenameModalOpen(false)
                    }
                  })
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
