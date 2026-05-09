import { Link, useParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomSnapshot } from '../api/roomsApi'
import { fetchFanProfile, patchFanProfileDisplayName } from '../api/fanProfileApi'
import { fetchRoom, patchRoom } from '../api/roomsApi'
import { fetchCatalogEpisodeById } from '../catalog/catalogApi'
import type { CatalogEpisode } from '../catalog/catalogTypes'
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
import { flushHostPending, handleHostSignal } from '../room/sharing/hostSignaling'
import { handleGuestSignal } from '../room/sharing/guestSignaling'
import type { GuestSignalingRefs } from '../room/sharing/guestSignaling'
import { guestNeedsHostNegotiation } from '../room/sharing/guestNegotiation'
import {
  GUEST_READY_BACKOFF_FACTOR,
  GUEST_READY_BASE_MS,
  GUEST_READY_MAX_MS,
} from '../room/sharing/constants'
import { collectInboundVideoHealth } from '../room/shareDiag'
import { installShareDiagnostics } from '../room/sharing/installShareDiag'
import { deriveShareFsm, summarizePcForFsm, type ShareSessionFsm } from '../room/sharing/shareSessionFsm'
import { SHARE_SIGNAL_PROTOCOL_VERSION } from '../room/sharing/types'
import {
  announceWebrtcDebugOnRoomMount,
  summarizeEnvelope,
  webrtcDebugEnabled,
  webrtcLog,
} from '../room/webrtcDebug'
import { fetchSfuJoinToken } from '../api/webrtcSfuApi'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import { getPublicSfuWsUrl } from '../config/sfuWsUrl'
import { connectSfuConsumer, connectSfuProducer } from '../room/sfu/mediasoupSharing'

const USE_MEDIASOU_SFU = import.meta.env.VITE_WEBRTC_USE_MEDIASOU_SFU === 'true'

const DISPLAY_TITLE_MAX_LEN = 120

type ChatMsg = { sessionId: string; text: string; ts: number; displayName?: string }

type PresenceMember = {
  sessionId: string
  displayName: string
  isHost: boolean
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function guestShareStatusLine(fsm: ReturnType<typeof deriveShareFsm>, wsDisconnected: boolean): string | null {
  if (wsDisconnected) return 'Reconnecting chat… Video may pause briefly.'
  switch (fsm) {
    case 'idle':
      return 'Negotiating connection with host…'
    case 'negotiating_ice':
      return 'Establishing encrypted path…'
    case 'verifying_media':
      return 'Verifying video feed…'
    case 'recovering_ice':
      return 'Recovering after network glitch…'
    case 'running':
      return null
    case 'failed':
      return 'Video link failed — try refreshing once the host is sharing.'
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
  const [catalogEp, setCatalogEp] = useState<CatalogEpisode | null>(null)
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [patchErr, setPatchErr] = useState<string | null>(null)
  const [shareHint, setShareHint] = useState<string | null>(null)
  const [captureErr, setCaptureErr] = useState<string | null>(null)
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
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameModalDraft, setRenameModalDraft] = useState('')
  const [profileDraft, setProfileDraft] = useState('')
  const [profileSaveErr, setProfileSaveErr] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

  const [guestFsmPollTick, setGuestFsmPollTick] = useState(0)
  const guestInboundHealthRef = useRef(false)
  const [guestShareFsmUi, setGuestShareFsmUi] = useState<ShareSessionFsm>('idle')
  const videoRef = useRef<HTMLVideoElement>(null)
  const hostCaptureVideoRef = useRef<HTMLVideoElement>(null)
  const peerByGuestRef = useRef(new Map<string, RTCPeerConnection>())
  const pendingReadyGuestsRef = useRef(new Set<string>())
  const hostPendingGuestIceRef = useRef(new Map<string, RTCIceCandidateInit[]>())
  const hostSigQRef = useRef<Promise<void>>(Promise.resolve())
  const guestPcRef = useRef<RTCPeerConnection | null>(null)
  const guestPendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const guestSigQRef = useRef<Promise<void>>(Promise.resolve())
  const guestRemoteRef = useRef<MediaStream | null>(null)
  const shareGenerationRef = useRef(0)
  const hostLastOfferGenByGuestRef = useRef(new Map<string, number>())
  const acceptedOfferShareGenerationRef = useRef(0)
  const lastDedupOfferGenerationRef = useRef(0)
  const sfuSessionRef = useRef<{ close: () => void } | null>(null)
  const isPublisherRef = useRef(false)
  const prevRoomSidebarTabRef = useRef<'chat' | 'people' | 'room' | 'profile'>('chat')

  const guestSignalingRefs = useMemo<GuestSignalingRefs>(
    () => ({
      guestPcRef,
      pendingIceRef: guestPendingIceRef,
      acceptedOfferShareGenerationRef,
      lastDedupOfferGenerationRef,
    }),
    [],
  )

  const wsBase = getPublicWsUrl()
  const fanToken = getFanAccessToken()
  const isPublisher = Boolean(room && fanToken && cognitoSub(fanToken) === room.hostSub)

  /** Prefer the room document id so WebSocket presence matches server fan-out even if the route param differed. */
  const canonicalRoomId = useMemo(() => room?.roomId ?? roomId, [room?.roomId, roomId])

  useEffect(() => {
    guestRemoteRef.current = guestRemote
  }, [guestRemote])

  useEffect(() => {
    isPublisherRef.current = isPublisher
  }, [isPublisher])

  /** Guest inbound stats drive “verifying” vs “running” for **`deriveShareFsm`**. */

  useEffect(() => {
    if (isPublisher) {
      queueMicrotask(() => setGuestShareFsmUi('idle'))
      guestInboundHealthRef.current = false
      return undefined
    }
    if (USE_MEDIASOU_SFU) {
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
    }
    queueMicrotask(() => {
      const liveVideos =
        guestRemote?.getTracks().some((t) => t.kind === 'video' && t.readyState === 'live') ?? false
      setGuestShareFsmUi(
        deriveShareFsm(summarizePcForFsm(guestPcRef.current), {
          recoveringIce: false,
          hasLiveRemoteVideo: liveVideos,
          mediaVerified: guestInboundHealthRef.current || liveVideos,
        }),
      )
    })
  }, [guestRemote, guestFsmPollTick, isPublisher])

  useEffect(() => {
    if (isPublisher) {
      guestInboundHealthRef.current = false
      return undefined
    }
    if (USE_MEDIASOU_SFU) {
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
    }
    let cancelled = false
    const tick = (): void => {
      void collectInboundVideoHealth(guestPcRef.current).then((h) => {
        guestInboundHealthRef.current =
          Boolean(h.framesDecoded) ||
          Boolean(h.framesReceived) ||
          (typeof h.bytesReceived === 'number' && h.bytesReceived > 0)
        if (!cancelled) setGuestFsmPollTick((n) => n + 1)
      })
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
    return installShareDiagnostics({
      isPublisherRef,
      shareGenerationRef,
      deriveShareFsm: () => {
        if (isPublisherRef.current) {
          const firstPc = [...peerByGuestRef.current.values()][0]
          const snap = summarizePcForFsm(firstPc ?? null)
          return deriveShareFsm(snap, {
            recoveringIce: false,
            hasLiveRemoteVideo: Boolean(firstPc && firstPc.connectionState === 'connected'),
            mediaVerified: true,
          })
        }
        const liveVideos =
          guestRemoteRef.current?.getTracks().some(
            (t) => t.kind === 'video' && t.readyState === 'live',
          ) ?? false
        const snap = summarizePcForFsm(guestPcRef.current)
        return deriveShareFsm(snap, {
          recoveringIce: false,
          hasLiveRemoteVideo: liveVideos,
          mediaVerified: guestInboundHealthRef.current || liveVideos,
        })
      },
      guestPcRef,
      peerByGuestRef,
    })
  }, [])

  useEffect(() => {
    guestPendingIceRef.current = []
    guestSigQRef.current = Promise.resolve()
    hostSigQRef.current = Promise.resolve()
    hostPendingGuestIceRef.current.clear()
    hostLastOfferGenByGuestRef.current.clear()
    shareGenerationRef.current = 0
    acceptedOfferShareGenerationRef.current = 0
    lastDedupOfferGenerationRef.current = 0
    guestPcRef.current?.close()
    guestPcRef.current = null
    queueMicrotask(() => setGuestRemote(null))
    for (const pc of peerByGuestRef.current.values()) {
      pc.close()
    }
    peerByGuestRef.current.clear()
    pendingReadyGuestsRef.current.clear()
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
        if (!dn) return
        const applied = setGuestDisplayName(dn)
        setDisplayName(applied)
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
    }
    prevRoomSidebarTabRef.current = roomSidebarTab
  }, [roomSidebarTab, displayName])

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
    if (!room?.catalogEpisodeId) return
    void fetchCatalogEpisodeById(room.catalogEpisodeId)
      .then(setCatalogEp)
      .catch(() => setCatalogEp(null))
  }, [room?.catalogEpisodeId])

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
        const ts = typeof data.ts === 'number' ? data.ts : Date.now()
        const dn = typeof data.displayName === 'string' ? data.displayName : undefined
        setChat((prev) => [
          ...prev,
          {
            sessionId: data.sessionId as string,
            text: String(data.text),
            ts,
            ...(dn !== undefined && dn !== '' ? { displayName: dn } : {}),
          },
        ])
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
          members.push({ sessionId: sid, displayName: dn, isHost: Boolean(m.isHost) })
        }
        setPresenceRoster({ roomId: data.roomId as string, members })
        return
      }
      if (t !== 'signaling' || USE_MEDIASOU_SFU) return

      const fromSessionId = typeof data.fromSessionId === 'string' ? data.fromSessionId : ''
      const role = data.role
      const envelope = data.envelope
      if (!fromSessionId || !isRecord(envelope)) return

      if (webrtcDebugEnabled()) {
        webrtcLog('ws in', {
          role,
          from: `${fromSessionId.slice(0, 8)}…`,
          ...summarizeEnvelope(envelope),
        })
      }

      if (!isPublisher) {
        if (role !== 'host') return
        guestSigQRef.current = guestSigQRef.current
          .then(() =>
            handleGuestSignal({
              mySessionId: sessionId,
              getIceServers,
              sendJson: (payload) => sendJsonRef.current(payload),
              refs: guestSignalingRefs,
              setGuestRemote,
              envelope,
            }),
          )
          .catch(() => undefined)
        return
      }

      if (role !== 'guest') return
      hostSigQRef.current = hostSigQRef.current
        .then(() =>
          handleHostSignal({
            fromSessionId,
            envelope,
            captureStream,
            getIceServers,
            sendJson: (payload) => sendJsonRef.current(payload),
            peerByGuestRef,
            pendingReadyGuestsRef,
            pendingGuestIceRef: hostPendingGuestIceRef,
            shareGenerationRef,
            hostLastOfferGenByGuestRef,
          }).catch(() => undefined),
        )
        .catch(() => undefined)
      return
    },
    [captureStream, getIceServers, guestSignalingRefs, isPublisher, canonicalRoomId, sessionId],
  )

  const { status: wsStatus, sendJson: wsSendJson } = useRoomWebSocket({
    url: wsBase,
    roomId: canonicalRoomId,
    sessionId,
    displayName,
    accessToken: isPublisher ? fanToken : null,
    enabled: Boolean(wsBase && canonicalRoomId && room),
    onMessage: onWsMessage,
  })

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
    if (!isPublisher) return
    const peerMap = peerByGuestRef.current
    const pend = pendingReadyGuestsRef.current
    const pendingIceByGuest = hostPendingGuestIceRef.current
    const offerGenByGuest = hostLastOfferGenByGuestRef.current
    return () => {
      for (const pc of peerMap.values()) {
        pc.close()
      }
      peerMap.clear()
      pend.clear()
      pendingIceByGuest.clear()
      offerGenByGuest.clear()
    }
  }, [isPublisher])

  /**
   * Guest: prompt the host to (re)negotiate until we have a live remote share.
   * Backoff reduces signaling load when ICE is slow; `guestRemote` in deps resets the chain when
   * the stream is cleared or replaced (fast re-arm after loss).
   */
  useEffect(() => {
    if (USE_MEDIASOU_SFU || isPublisher || wsStatus !== 'open') return
    let cancelled = false
    let tid: number | null = null
    let delayMs = GUEST_READY_BASE_MS

    const clear = () => {
      if (tid !== null) {
        clearTimeout(tid)
        tid = null
      }
    }

    const sendReady = () => {
      const gen = acceptedOfferShareGenerationRef.current
      sendJsonRef.current({
        action: 'signaling',
        envelope: {
          guestSignaling: true,
          kind: 'ready',
          ...(gen > 0
            ? { protocolVersion: SHARE_SIGNAL_PROTOCOL_VERSION, shareGeneration: gen }
            : {}),
        },
      })
    }

    function tick(): void {
      if (cancelled) return
      tid = null
      if (!guestNeedsHostNegotiation(guestRemoteRef.current)) {
        delayMs = GUEST_READY_BASE_MS
        return
      }
      sendReady()
      delayMs = Math.min(Math.round(delayMs * GUEST_READY_BACKOFF_FACTOR), GUEST_READY_MAX_MS)
      tid = window.setTimeout(tick, delayMs)
    }

    if (guestNeedsHostNegotiation(guestRemoteRef.current)) {
      sendReady()
      delayMs = Math.min(Math.round(delayMs * GUEST_READY_BACKOFF_FACTOR), GUEST_READY_MAX_MS)
      tid = window.setTimeout(tick, delayMs)
    }

    return () => {
      cancelled = true
      clear()
    }
  }, [isPublisher, wsStatus, guestRemote])

  useEffect(() => {
    if (!guestRemote || isPublisher) return

    const clearIfAllEnded = () => {
      const s = guestRemoteRef.current
      if (!s || s.getTracks().some((t) => t.readyState === 'live')) return
      guestPcRef.current?.close()
      guestPcRef.current = null
      guestPendingIceRef.current = []
      acceptedOfferShareGenerationRef.current = 0
      lastDedupOfferGenerationRef.current = 0
      setGuestRemote(null)
    }

    const subs: Array<{ track: MediaStreamTrack; fn: () => void }> = []
    for (const track of guestRemote.getTracks()) {
      const fn = () => clearIfAllEnded()
      track.addEventListener('ended', fn)
      subs.push({ track, fn })
    }
    return () => {
      for (const { track, fn } of subs) {
        track.removeEventListener('ended', fn)
      }
    }
  }, [guestRemote, isPublisher])

  useEffect(() => {
    if (USE_MEDIASOU_SFU || !captureStream || !isPublisher || wsStatus !== 'open') return
    void flushHostPending({
      captureStream,
      getIceServers,
      sendJson: (payload) => sendJsonRef.current(payload),
      peerByGuestRef,
      pendingReadyGuestsRef,
      pendingGuestIceRef: hostPendingGuestIceRef,
      shareGenerationRef,
      hostLastOfferGenByGuestRef,
    }).catch(() => undefined)
  }, [captureStream, getIceServers, isPublisher, wsStatus])

  useEffect(() => {
    if (!USE_MEDIASOU_SFU || !isPublisher || !captureStream || wsStatus !== 'open') return
    const api = getPublicApiBaseUrl()
    const configuredWs = getPublicSfuWsUrl()
    if (!api || !canonicalRoomId) return
    let cancelled = false
    void (async () => {
      try {
        const tok = await fetchSfuJoinToken({
          apiBaseUrl: api,
          roomId: canonicalRoomId,
          sessionId,
          accessToken: fanToken,
        })
        if (cancelled || tok.role !== 'producer') return
        const wsUrl = tok.wsUrl ?? configuredWs
        if (!wsUrl) {
          console.warn('[riffsync] SFU: set VITE_PUBLIC_SFU_WS_URL or CDK context sfuPublicWsUrl')
          return
        }
        sfuSessionRef.current?.close()
        sfuSessionRef.current = await connectSfuProducer({
          wsBaseUrl: wsUrl,
          token: tok.token,
          captureStream,
          getIceServers,
        })
      } catch (e) {
        console.warn('[riffsync] SFU producer error', e)
      }
    })()
    return () => {
      cancelled = true
      sfuSessionRef.current?.close()
      sfuSessionRef.current = null
    }
  }, [isPublisher, captureStream, wsStatus, canonicalRoomId, sessionId, fanToken, getIceServers])

  useEffect(() => {
    if (!USE_MEDIASOU_SFU || isPublisher || wsStatus !== 'open') return
    const api = getPublicApiBaseUrl()
    const configuredWs = getPublicSfuWsUrl()
    if (!api || !canonicalRoomId) return
    let cancelled = false
    void (async () => {
      try {
        const tok = await fetchSfuJoinToken({
          apiBaseUrl: api,
          roomId: canonicalRoomId,
          sessionId,
          accessToken: null,
        })
        if (cancelled || tok.role !== 'consumer') return
        const wsUrl = tok.wsUrl ?? configuredWs
        if (!wsUrl) {
          console.warn('[riffsync] SFU: set VITE_PUBLIC_SFU_WS_URL or CDK context sfuPublicWsUrl')
          return
        }
        sfuSessionRef.current?.close()
        sfuSessionRef.current = await connectSfuConsumer({
          wsBaseUrl: wsUrl,
          token: tok.token,
          getIceServers,
          onRemoteStream: setGuestRemote,
        })
      } catch (e) {
        console.warn('[riffsync] SFU consumer error', e)
      }
    })()
    return () => {
      cancelled = true
      sfuSessionRef.current?.close()
      sfuSessionRef.current = null
    }
  }, [isPublisher, wsStatus, canonicalRoomId, sessionId, getIceServers])

  useEffect(() => {
    if (isPublisher) return
    queueMicrotask(() => {
      guestPcRef.current?.close()
      guestPcRef.current = null
      acceptedOfferShareGenerationRef.current = 0
      lastDedupOfferGenerationRef.current = 0
      setGuestRemote(null)
    })
  }, [isPublisher])

  useEffect(() => {
    const v = videoRef.current
    if (!v || isPublisher) return
    if (!guestRemote) {
      v.srcObject = null
      return
    }
    v.srcObject = guestRemote
    let cancelled = false
    void (async () => {
      v.muted = false
      try {
        await v.play()
        if (!cancelled) setGuestPlayHint(false)
        return
      } catch {
        /* autoplay policy often blocks unmuted remote playback */
      }
      try {
        v.muted = true
        await v.play()
        if (!cancelled) setGuestPlayHint(false)
      } catch {
        if (!cancelled) setGuestPlayHint(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [guestRemote, isPublisher])

  useEffect(() => {
    const v = hostCaptureVideoRef.current
    if (!v || !isPublisher) return
    if (!captureStream) {
      v.srcObject = null
      return
    }
    v.srcObject = captureStream
    void v.play().catch(() => setHostCapturePlayHint(true))
  }, [captureStream, isPublisher])

  const stopCapture = () => {
    setHostCapturePlayHint(false)
    shareGenerationRef.current = 0
    hostLastOfferGenByGuestRef.current.clear()
    sfuSessionRef.current?.close()
    sfuSessionRef.current = null
    setCaptureStream((prev) => {
      if (prev) prev.getTracks().forEach((t) => t.stop())
      return null
    })
    for (const pc of peerByGuestRef.current.values()) {
      pc.close()
    }
    peerByGuestRef.current.clear()
    pendingReadyGuestsRef.current.clear()
    hostPendingGuestIceRef.current.clear()
  }

  const startCapture = async () => {
    setCaptureErr(null)

    const applyStream = (stream: MediaStream) => {
      shareGenerationRef.current += 1
      setHostCapturePlayHint(false)
      stream.getTracks().forEach((tr) => {
        tr.addEventListener('ended', () => {
          stopCapture()
        })
      })
      setCaptureStream(stream)
      webrtcLog('capture stream applied, tracks:', stream.getTracks().length)
    }

    try {
      if (import.meta.env.DEV) {
        const isE2e = new URLSearchParams(window.location.search).get('riffsyncE2e') === '1'
        if (isE2e) {
          const { createSyntheticDisplayStream } = await import('../room/sharing/e2eCapture')
          applyStream(createSyntheticDisplayStream())
          return
        }
      }
    } catch {
      /* fall through to real capture */
    }

    try {
      // Chrome defaults `selfBrowserSurface` to "exclude", which omits the *current* tab from the
      // "Chrome Tab" picker—bad when the host wants to share this tab. See:
      // https://developer.chrome.com/docs/web-platform/screen-sharing-controls
      const stream = await navigator.mediaDevices.getDisplayMedia({
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
      } as Parameters<MediaDevices['getDisplayMedia']>[0] & {
        selfBrowserSurface?: 'include' | 'exclude'
        surfaceSwitching?: 'include' | 'exclude'
      })
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
    sendJson({ action: 'chat', text: txt })
    setChatDraft('')
  }

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
      .then(() => {
        const applied = setGuestDisplayName(trimmed)
        setDisplayName(applied)
        setProfileDraft(applied)
      })
      .catch((e) => {
        setProfileSaveErr(e instanceof Error ? e.message : 'Could not save profile.')
      })
      .finally(() => {
        setProfileSaving(false)
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
    v.muted = false
    try {
      await v.play()
      setGuestPlayHint(false)
      return
    } catch {
      /* continue */
    }
    try {
      v.muted = true
      await v.play()
      setGuestPlayHint(false)
    } catch {
      setGuestPlayHint(true)
    }
  }

  const playHostCapturePreview = async () => {
    const v = hostCaptureVideoRef.current
    if (!v) return
    try {
      await v.play()
      setHostCapturePlayHint(false)
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

  const nowPlayingLabel = room.displayTitle ?? catalogEp?.title ?? room.catalogEpisodeId
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
        <div className="riffsync-room-page__stage">
          <div className="riffsync-room-page__theater">
            {isPublisher ? (
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
                          FAQ
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
                  <video
                    ref={videoRef}
                    className="riffsync-room-page__guest-video"
                    playsInline
                    controls
                    muted={false}
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
            )}
          </div>

          <aside className="riffsync-room-page__chat-column" aria-label="Room sidebar">
            <p className="riffsync-room-page__sidebar-now-playing">
              Now Playing:{` `}
              <span className="riffsync-room-page__sidebar-now-playing-muted">{nowPlayingLabel}</span>
            </p>
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
                  <ul className="riffsync-room-chat-log">
                    {chat.map((m) => (
                      <li key={`${m.sessionId}:${m.ts}:${m.text.slice(0, 12)}`}>
                        <span className="riffsync-room-chat-log__who">
                          {(m.displayName && m.displayName.trim() !== ''
                            ? m.displayName
                            : chatMemberLabels.get(m.sessionId)) ??
                            `${m.sessionId.slice(0, 6)}…`}
                        </span>
                        {': '}
                        {m.text}
                      </li>
                    ))}
                  </ul>
                  <div className="riffsync-room-chat-compose-holder">
                    <div
                      className={`riffsync-room-chat-compose${fanToken ? '' : ' riffsync-room-chat-compose--inactive'}`}
                    >
                      <input
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
                      <button type="button" className="gen-button" disabled={!fanToken} onClick={sendChat}>
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
                          Sign in (optional)
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {activeSidebarTab === 'people' ? (
                <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--people">
                  <ul className="riffsync-room-page__people-list" aria-label="People currently connected">
                    {peopleShown.map((p) => (
                      <li
                        key={p.sessionId}
                        className={`riffsync-room-page__people-row${p.isHost ? ' riffsync-room-page__people-row--host' : ''}`}
                      >
                        <span className="riffsync-room-page__person-label">
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
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {activeSidebarTab === 'room' ? (
                <div className="riffsync-room-page__tab-panel riffsync-room-page__room-panel">
                  <button type="button" className="gen-button gen-button-wide" onClick={() => void copyShare()}>
                    Copy room link
                  </button>
                  {isPublisher ? (
                    <button type="button" className="gen-button gen-button-wide" onClick={openRenameModal}>
                      Rename room
                    </button>
                  ) : null}
                  {isPublisher ? (
                    <Link className="gen-button gen-button-wide" to="/how-to-host-a-watchparty">
                      Hosting Tips
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
            </section>
          </aside>
        </div>
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
              Rename room
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
