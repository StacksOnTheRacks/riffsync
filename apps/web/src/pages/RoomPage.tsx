import { Link, useParams } from 'react-router-dom'
import type { MutableRefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomSnapshot } from '../api/roomsApi'
import { fetchRoom, patchRoom } from '../api/roomsApi'
import { fetchCatalogEpisodeById } from '../catalog/catalogApi'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { cognitoSub } from '../auth/jwtDecode'
import { getFanAccessToken } from '../auth/fanTokens'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'
import { ensureGuestSession } from '../session/guestSession'
import { getPublicWsUrl } from '../config/wsUrl'
import { getPublicOrigin } from '../config/publicOrigin'
import { getRtcIceServers } from '../config/iceServers'
import { useRoomWebSocket } from '../room/useRoomWebSocket'
import {
  attachPcStateLogging,
  summarizeEnvelope,
  webrtcDebugEnabled,
  webrtcLog,
} from '../room/webrtcDebug'
const DISPLAY_TITLE_MAX_LEN = 120

function hostShareDismissStorageKey(roomId: string): string {
  return `riffsync_hostShareDismiss_${roomId}`
}

function readHostShareInstructionsOpen(roomId: string): boolean {
  if (!roomId) return true
  try {
    return sessionStorage.getItem(hostShareDismissStorageKey(roomId)) !== '1'
  } catch {
    return true
  }
}

type ChatMsg = { sessionId: string; text: string; ts: number }

type PresenceMember = {
  sessionId: string
  displayName: string
  isHost: boolean
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

type HostNegotiateCtx = {
  iceServers: RTCIceServer[]
  sendJson: (payload: Record<string, unknown>) => void
  peerByGuestRef: MutableRefObject<Map<string, RTCPeerConnection>>
  pendingReadyGuestsRef: MutableRefObject<Set<string>>
}

async function ensureHostPeerNegotiated(
  ctx: HostNegotiateCtx & { captureStream: MediaStream },
  guestSessionId: string,
): Promise<void> {
  const stream = ctx.captureStream
  let pc = ctx.peerByGuestRef.current.get(guestSessionId)
  if (pc && pc.signalingState !== 'closed') {
    pc.close()
  }
  pc = new RTCPeerConnection({ iceServers: ctx.iceServers })
  attachPcStateLogging(pc, `host→${guestSessionId.slice(0, 8)}…`)
  ctx.peerByGuestRef.current.set(guestSessionId, pc)
  for (const t of stream.getTracks()) {
    pc.addTrack(t, stream)
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      ctx.sendJson({
        action: 'signaling',
        envelope: {
          kind: 'ice',
          candidate: e.candidate.toJSON(),
          targetSessionId: guestSessionId,
        },
      })
    }
  }
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  ctx.sendJson({
    action: 'signaling',
    envelope: {
      kind: 'offer',
      sdp: { type: offer.type, sdp: offer.sdp ?? '' },
      targetSessionId: guestSessionId,
    },
  })
}

async function flushHostPending(
  opts: HostNegotiateCtx & { captureStream: MediaStream },
): Promise<void> {
  const ids = [...opts.pendingReadyGuestsRef.current]
  opts.pendingReadyGuestsRef.current.clear()
  for (const sid of ids) {
    await ensureHostPeerNegotiated(opts, sid).catch(() => undefined)
  }
}

async function handleHostSignal(
  ctx: HostNegotiateCtx & { captureStream: MediaStream | null; fromSessionId: string; envelope: Record<string, unknown> },
): Promise<void> {
  const guestSignaling = ctx.envelope.guestSignaling === true
  const kind = ctx.envelope.kind

  if (guestSignaling && kind === 'ready') {
    if (!ctx.captureStream) {
      ctx.pendingReadyGuestsRef.current.add(ctx.fromSessionId)
      return
    }
    await ensureHostPeerNegotiated(
      {
        captureStream: ctx.captureStream,
        iceServers: ctx.iceServers,
        sendJson: ctx.sendJson,
        peerByGuestRef: ctx.peerByGuestRef,
        pendingReadyGuestsRef: ctx.pendingReadyGuestsRef,
      },
      ctx.fromSessionId,
    ).catch(() => undefined)
    return
  }

  const pc = ctx.peerByGuestRef.current.get(ctx.fromSessionId)
  if (!pc) return

  if (guestSignaling && kind === 'answer') {
    const sdp = ctx.envelope.sdp
    if (isRecord(sdp) && typeof sdp.sdp === 'string' && typeof sdp.type === 'string') {
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(sdp as unknown as RTCSessionDescriptionInit),
        )
      } catch {
        /* ignore malformed SDP */
      }
    }
    return
  }

  if (guestSignaling && kind === 'ice') {
    const cand = ctx.envelope.candidate
    if (isRecord(cand)) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand as RTCIceCandidateInit))
      } catch {
        /* ignore stale / invalid candidate */
      }
    }
  }
}

async function handleGuestSignal(ctx: {
  mySessionId: string
  iceServers: RTCIceServer[]
  sendJson: (payload: Record<string, unknown>) => void
  guestPcRef: MutableRefObject<RTCPeerConnection | null>
  pendingIceRef: MutableRefObject<RTCIceCandidateInit[]>
  setGuestRemote: (s: MediaStream | null) => void
  envelope: Record<string, unknown>
}): Promise<void> {
  const kind = ctx.envelope.kind

  if (kind === 'offer') {
    if (ctx.envelope.targetSessionId !== ctx.mySessionId) return
    const sdp = ctx.envelope.sdp
    if (!isRecord(sdp) || typeof sdp.sdp !== 'string' || typeof sdp.type !== 'string') return

    const prev = ctx.guestPcRef.current
    prev?.close()
    ctx.pendingIceRef.current = []

    const pc = new RTCPeerConnection({ iceServers: ctx.iceServers })
    attachPcStateLogging(pc, 'guest')
    ctx.guestPcRef.current = pc

    pc.ontrack = (ev) => {
      const [stream] = ev.streams
      if (stream) ctx.setGuestRemote(stream)
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ctx.sendJson({
          action: 'signaling',
          envelope: {
            guestSignaling: true,
            kind: 'ice',
            candidate: e.candidate.toJSON(),
          },
        })
      }
    }

    try {
      await pc.setRemoteDescription(
        new RTCSessionDescription(sdp as unknown as RTCSessionDescriptionInit),
      )
      while (ctx.pendingIceRef.current.length > 0) {
        const batch = ctx.pendingIceRef.current.splice(0)
        for (const init of batch) {
          await pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => undefined)
        }
      }
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      ctx.sendJson({
        action: 'signaling',
        envelope: {
          guestSignaling: true,
          kind: 'answer',
          sdp: { type: answer.type, sdp: answer.sdp ?? '' },
        },
      })
    } catch {
      /* ignore handshake failure */
    }
    return
  }

  if (kind === 'ice' && ctx.envelope.targetSessionId === ctx.mySessionId) {
    const cand = ctx.envelope.candidate
    const pc = ctx.guestPcRef.current
    if (!pc || !isRecord(cand)) return
    const init = cand as RTCIceCandidateInit
    if (!pc.remoteDescription) {
      ctx.pendingIceRef.current.push(init)
      return
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(init))
    } catch {
      /* ignore */
    }
  }
}

export function RoomPage() {
  const { roomId: roomIdParam } = useParams<{ roomId: string }>()
  const roomId = roomIdParam ? decodeURIComponent(roomIdParam) : ''

  const [{ sessionId, displayName }] = useState(() => ensureGuestSession('room'))

  const [room, setRoom] = useState<RoomSnapshot | null | undefined>(undefined)
  const [roomErr, setRoomErr] = useState<string | null>(null)
  const [catalogEp, setCatalogEp] = useState<CatalogEpisode | null>(null)
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [patchErr, setPatchErr] = useState<string | null>(null)
  const [shareHint, setShareHint] = useState<string | null>(null)
  const [showHostShareInstructions, setShowHostShareInstructions] = useState(() =>
    readHostShareInstructionsOpen(roomId),
  )
  const [shareInstrRoomId, setShareInstrRoomId] = useState(roomId)
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
  const [roomSidebarTab, setRoomSidebarTab] = useState<'chat' | 'people'>('chat')
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameModalDraft, setRenameModalDraft] = useState('')
  const roomMenuDetailsRef = useRef<HTMLDetailsElement>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const hostCaptureVideoRef = useRef<HTMLVideoElement>(null)
  const peerByGuestRef = useRef(new Map<string, RTCPeerConnection>())
  const pendingReadyGuestsRef = useRef(new Set<string>())
  const guestPcRef = useRef<RTCPeerConnection | null>(null)
  const guestPendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const guestSigQRef = useRef<Promise<void>>(Promise.resolve())
  const guestRemoteRef = useRef<MediaStream | null>(null)

  const wsBase = getPublicWsUrl()
  const fanToken = getFanAccessToken()
  const isPublisher = Boolean(room && fanToken && cognitoSub(fanToken) === room.hostSub)

  if (roomId !== shareInstrRoomId) {
    setShareInstrRoomId(roomId)
    setShowHostShareInstructions(readHostShareInstructionsOpen(roomId))
  }

  useEffect(() => {
    guestRemoteRef.current = guestRemote
  }, [guestRemote])

  useEffect(() => {
    guestPendingIceRef.current = []
    guestSigQRef.current = Promise.resolve()
  }, [roomId])

  const peopleShown = useMemo(() => {
    const roster = presenceRoster.roomId === roomId ? presenceRoster.members : []
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
  }, [presenceRoster.members, presenceRoster.roomId, roomId, sessionId, displayName, isPublisher])

  const iceServers = useMemo(() => getRtcIceServers(), [])

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
        setChat((prev) => [
          ...prev,
          {
            sessionId: data.sessionId as string,
            text: String(data.text),
            ts,
          },
        ])
        return
      }
      if (t === 'presence' && typeof data.roomId === 'string') {
        if (data.roomId !== roomId) return
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
      if (t !== 'signaling') return

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
              iceServers,
              sendJson: (payload) => sendJsonRef.current(payload),
              guestPcRef,
              pendingIceRef: guestPendingIceRef,
              setGuestRemote,
              envelope,
            }),
          )
          .catch(() => undefined)
        return
      }

      if (role !== 'guest') return
      void handleHostSignal({
        fromSessionId,
        envelope,
        captureStream,
        iceServers,
        sendJson: (payload) => sendJsonRef.current(payload),
        peerByGuestRef,
        pendingReadyGuestsRef,
      }).catch(() => undefined)
    },
    [captureStream, iceServers, isPublisher, roomId, sessionId],
  )

  const { status: wsStatus, sendJson: wsSendJson } = useRoomWebSocket({
    url: wsBase,
    roomId,
    sessionId,
    displayName,
    accessToken: isPublisher ? fanToken : null,
    enabled: Boolean(wsBase && roomId && room),
    onMessage: onWsMessage,
  })

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
    return () => {
      for (const pc of peerMap.values()) {
        pc.close()
      }
      peerMap.clear()
      pend.clear()
    }
  }, [isPublisher])

  useEffect(() => {
    if (isPublisher || wsStatus !== 'open') return
    const sendReady = () => {
      if (guestRemoteRef.current) return
      sendJson({
        action: 'signaling',
        envelope: { guestSignaling: true, kind: 'ready' },
      })
    }
    sendReady()
    const id = window.setInterval(sendReady, 8000)
    return () => window.clearInterval(id)
  }, [isPublisher, wsStatus, sendJson])

  useEffect(() => {
    if (!captureStream || !isPublisher || wsStatus !== 'open') return
    void flushHostPending({
      captureStream,
      iceServers,
      sendJson: (payload) => sendJsonRef.current(payload),
      peerByGuestRef,
      pendingReadyGuestsRef,
    }).catch(() => undefined)
  }, [captureStream, iceServers, isPublisher, wsStatus])

  useEffect(() => {
    if (isPublisher) return
    queueMicrotask(() => {
      guestPcRef.current?.close()
      guestPcRef.current = null
      setGuestRemote(null)
    })
  }, [isPublisher])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !guestRemote || isPublisher) return
    setGuestPlayHint(false)
    v.srcObject = guestRemote
    void v.play().catch(() => setGuestPlayHint(true))
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
    setCaptureStream((prev) => {
      if (prev) prev.getTracks().forEach((t) => t.stop())
      return null
    })
    for (const pc of peerByGuestRef.current.values()) {
      pc.close()
    }
    peerByGuestRef.current.clear()
    pendingReadyGuestsRef.current.clear()
  }

  const startCapture = async () => {
    setCaptureErr(null)

    const applyStream = (stream: MediaStream) => {
      setHostCapturePlayHint(false)
      stream.getTracks().forEach((tr) => {
        tr.addEventListener('ended', () => {
          stopCapture()
        })
      })
      setCaptureStream(stream)
      webrtcLog('getDisplayMedia OK, tracks:', stream.getTracks().length)
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
    if (roomMenuDetailsRef.current) roomMenuDetailsRef.current.open = false
  }

  const sendChat = () => {
    if (!fanToken) return
    const txt = chatDraft.trim()
    if (!txt) return
    sendJson({ action: 'chat', text: txt })
    setChatDraft('')
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

  const dismissHostShareInstructions = () => {
    try {
      sessionStorage.setItem(hostShareDismissStorageKey(roomId), '1')
    } catch {
      /* ignore private mode */
    }
    setShowHostShareInstructions(false)
  }

  const playGuestVideo = async () => {
    const v = videoRef.current
    if (!v) return
    try {
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
                {showHostShareInstructions ? (
                  <div
                    className="riffsync-room-page__host-share-panel"
                    role="region"
                    aria-label="How to broadcast"
                  >
                    <h3>How to broadcast</h3>
                    <div className="riffsync-room-page__host-share-panel-body riffsync-muted">
                      <p>
                        Start with <strong>Open Source Tab</strong> below, then{' '}
                        <strong>Share Source Tab</strong> and pick that player tab in the browser picker — not this tab.
                        Guests will see whatever you preview in the theater frame below.
                      </p>
                    </div>
                    <p className="riffsync-room-page__host-share-footnote riffsync-muted">
                      When you&apos;re done sharing, use your browser&apos;s <strong>Stop sharing</strong> control — it appears
                      at the top of this tab while broadcast is live. You can open or close the source tab anytime.
                    </p>
                    <div className="riffsync-room-page__host-share-actions">
                      <button
                        type="button"
                        className="gen-button gen-button--ghost"
                        onClick={dismissHostShareInstructions}
                      >
                        Dismiss for this session
                      </button>
                    </div>
                  </div>
                ) : null}
                <h2 className="riffsync-room-page__theater-heading">{nowPlayingLabel}</h2>
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
                      <p className="riffsync-room-page__host-preview-placeholder__instructions riffsync-muted">
                        Nothing shared yet. Choose <strong>Share Source Tab</strong>, then pick your{' '}
                        <strong>player tab</strong> in the picker — not this tab.
                      </p>
                      <div className="riffsync-room-page__center-share-buttons">
                        <button type="button" className="gen-button" onClick={openCapturePlayerTab}>
                          Open Source Tab
                        </button>
                        <button type="button" className="gen-button" onClick={() => void startCapture()}>
                          Share Source Tab
                        </button>
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
                  Watching the shared video stream from this room&apos;s host. Use Play if the browser blocks autoplay.
                </span>
                <h2 className="riffsync-room-page__theater-heading">{nowPlayingLabel}</h2>
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

              <div className="riffsync-room-page__chat-toolbar riffsync-room-page__chat-toolbar--split">
                <div className="riffsync-room-page__tabs">
                  <button
                    type="button"
                    className={`riffsync-room-page__tab${roomSidebarTab === 'chat' ? ' riffsync-room-page__tab--on' : ''}`}
                    aria-pressed={roomSidebarTab === 'chat'}
                    onClick={() => setRoomSidebarTab('chat')}
                  >
                    Chat
                  </button>
                  <button
                    type="button"
                    className={`riffsync-room-page__tab${roomSidebarTab === 'people' ? ' riffsync-room-page__tab--on' : ''}`}
                    aria-pressed={roomSidebarTab === 'people'}
                    onClick={() => setRoomSidebarTab('people')}
                  >
                    People
                  </button>
                </div>
                <details ref={roomMenuDetailsRef} className="riffsync-room-page__room-menu">
                  <summary className="riffsync-room-page__room-menu-trigger">Room</summary>
                  <div className="riffsync-room-page__room-menu-panel">
                    <button type="button" className="gen-button gen-button-wide" onClick={() => void copyShare()}>
                      Copy room link
                    </button>
                    {isPublisher ? (
                      <button type="button" className="gen-button gen-button-wide" onClick={openRenameModal}>
                        Rename room
                      </button>
                    ) : null}
                    {shareHint ? <span className="riffsync-room-page__hint">{shareHint}</span> : null}
                  </div>
                </details>
              </div>

              {roomSidebarTab === 'chat' ? (
                <>
                  <ul className="riffsync-room-chat-log">
                    {chat.map((m) => (
                      <li key={`${m.sessionId}:${m.ts}:${m.text.slice(0, 12)}`}>
                        <span className="riffsync-room-chat-log__who">{m.sessionId.slice(0, 6)}…</span>
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
                </>
              ) : (
                <ul className="riffsync-room-page__people-list" aria-label="People currently connected">
                  {peopleShown.map((p) => (
                    <li key={p.sessionId}>
                      <span className="riffsync-room-page__person-label">
                        {p.isHost ? (
                          <>
                            <strong>{p.displayName}</strong>
                            <span className="riffsync-muted"> (Host)</span>
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
              )}
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
