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
import { SITE_DOCUMENT_TITLE, trimTabTitleSegment } from '../config/documentTitle'
import { useRoomWebSocket } from '../room/useRoomWebSocket'
import { hostShouldSkipRenegotiation } from '../room/hostRenegotiationPolicy'
import {
  attachPcStateLogging,
  summarizeEnvelope,
  webrtcDebugEnabled,
  webrtcLog,
} from '../room/webrtcDebug'
const DISPLAY_TITLE_MAX_LEN = 120

type ChatMsg = { sessionId: string; text: string; ts: number }

type PresenceMember = {
  sessionId: string
  displayName: string
  isHost: boolean
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** True when the guest should ask the host to (re)publish — no stream yet or all remote tracks have ended. */
function guestNeedsHostNegotiation(remote: MediaStream | null): boolean {
  if (!remote) return true
  return !remote.getTracks().some((t) => t.readyState === 'live')
}

type HostNegotiateCtx = {
  iceServers: RTCIceServer[]
  sendJson: (payload: Record<string, unknown>) => void
  peerByGuestRef: MutableRefObject<Map<string, RTCPeerConnection>>
  pendingReadyGuestsRef: MutableRefObject<Set<string>>
  pendingGuestIceRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>
}

async function ensureHostPeerNegotiated(
  ctx: HostNegotiateCtx & { captureStream: MediaStream },
  guestSessionId: string,
): Promise<void> {
  const stream = ctx.captureStream
  const existing = ctx.peerByGuestRef.current.get(guestSessionId)
  if (existing && existing.signalingState !== 'closed') {
    if (
      hostShouldSkipRenegotiation({
        signalingState: existing.signalingState,
        connectionState: existing.connectionState,
        hasRemoteDescription: existing.currentRemoteDescription != null,
      })
    ) {
      return
    }
    existing.close()
  }
  ctx.pendingGuestIceRef.current.delete(guestSessionId)
  const pc = new RTCPeerConnection({ iceServers: ctx.iceServers })
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
  ctx: HostNegotiateCtx & {
    captureStream: MediaStream | null
    fromSessionId: string
    envelope: Record<string, unknown>
  },
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
        pendingGuestIceRef: ctx.pendingGuestIceRef,
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
        const sid = ctx.fromSessionId
        const queued = ctx.pendingGuestIceRef.current.get(sid)
        ctx.pendingGuestIceRef.current.delete(sid)
        if (queued?.length) {
          for (const init of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => undefined)
          }
        }
      } catch {
        /* ignore malformed SDP */
      }
    }
    return
  }

  if (guestSignaling && kind === 'ice') {
    const cand = ctx.envelope.candidate
    if (!isRecord(cand)) return
    const init = cand as RTCIceCandidateInit
    if (!pc.currentRemoteDescription) {
      const m = ctx.pendingGuestIceRef.current
      const arr = m.get(ctx.fromSessionId) ?? []
      arr.push(init)
      m.set(ctx.fromSessionId, arr)
      return
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(init))
    } catch {
      /* ignore stale / invalid candidate */
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
    if (prev) ctx.pendingIceRef.current = []

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

    pc.onconnectionstatechange = () => {
      if (pc !== ctx.guestPcRef.current) return
      if (pc.connectionState !== 'failed') return
      ctx.pendingIceRef.current = []
      ctx.guestPcRef.current = null
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      ctx.setGuestRemote(null)
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
    if (!isRecord(cand)) return
    const init = cand as RTCIceCandidateInit
    const pc = ctx.guestPcRef.current
    if (!pc) {
      ctx.pendingIceRef.current.push(init)
      return
    }
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
  const [roomSidebarTab, setRoomSidebarTab] = useState<'chat' | 'people' | 'room'>('chat')
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameModalDraft, setRenameModalDraft] = useState('')

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

  const wsBase = getPublicWsUrl()
  const fanToken = getFanAccessToken()
  const isPublisher = Boolean(room && fanToken && cognitoSub(fanToken) === room.hostSub)

  useEffect(() => {
    guestRemoteRef.current = guestRemote
  }, [guestRemote])

  useEffect(() => {
    guestPendingIceRef.current = []
    guestSigQRef.current = Promise.resolve()
    hostSigQRef.current = Promise.resolve()
    hostPendingGuestIceRef.current.clear()
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
      hostSigQRef.current = hostSigQRef.current
        .then(() =>
          handleHostSignal({
            fromSessionId,
            envelope,
            captureStream,
            iceServers,
            sendJson: (payload) => sendJsonRef.current(payload),
            peerByGuestRef,
            pendingReadyGuestsRef,
            pendingGuestIceRef: hostPendingGuestIceRef,
          }).catch(() => undefined),
        )
        .catch(() => undefined)
      return
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
    const pendingIceByGuest = hostPendingGuestIceRef.current
    return () => {
      for (const pc of peerMap.values()) {
        pc.close()
      }
      peerMap.clear()
      pend.clear()
      pendingIceByGuest.clear()
    }
  }, [isPublisher])

  useEffect(() => {
    if (isPublisher || wsStatus !== 'open') return
    const sendReady = () => {
      if (!guestNeedsHostNegotiation(guestRemoteRef.current)) return
      sendJsonRef.current({
        action: 'signaling',
        envelope: { guestSignaling: true, kind: 'ready' },
      })
    }
    sendReady()
    const id = window.setInterval(sendReady, 8000)
    return () => window.clearInterval(id)
  }, [isPublisher, wsStatus])

  /** Re-arm host negotiation as soon as the guest has no live remote share (fast path vs 8s poll). */
  useEffect(() => {
    if (isPublisher || wsStatus !== 'open') return
    if (!guestNeedsHostNegotiation(guestRemote)) return
    sendJsonRef.current({
      action: 'signaling',
      envelope: { guestSignaling: true, kind: 'ready' },
    })
  }, [guestRemote, isPublisher, wsStatus])

  useEffect(() => {
    if (!guestRemote || isPublisher) return

    const clearIfAllEnded = () => {
      const s = guestRemoteRef.current
      if (!s || s.getTracks().some((t) => t.readyState === 'live')) return
      guestPcRef.current?.close()
      guestPcRef.current = null
      guestPendingIceRef.current = []
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
    if (!captureStream || !isPublisher || wsStatus !== 'open') return
    void flushHostPending({
      captureStream,
      iceServers,
      sendJson: (payload) => sendJsonRef.current(payload),
      peerByGuestRef,
      pendingReadyGuestsRef,
      pendingGuestIceRef: hostPendingGuestIceRef,
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
    if (!v || isPublisher) return
    if (!guestRemote) {
      v.srcObject = null
      return
    }
    v.srcObject = guestRemote
    void v
      .play()
      .then(() => setGuestPlayHint(false))
      .catch(() => setGuestPlayHint(true))
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
    hostPendingGuestIceRef.current.clear()
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
  const viewerCount = peopleShown.length

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
                  Watching the shared video stream from this room&apos;s host. Use Play if the browser blocks autoplay.
                </span>
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
                    People ({viewerCount})
                  </button>
                  <button
                    type="button"
                    className={`riffsync-room-page__tab${roomSidebarTab === 'room' ? ' riffsync-room-page__tab--on' : ''}`}
                    aria-pressed={roomSidebarTab === 'room'}
                    onClick={() => setRoomSidebarTab('room')}
                  >
                    Room
                  </button>
                </div>
              </div>

              {roomSidebarTab === 'chat' ? (
                <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--chat">
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
                </div>
              ) : null}
              {roomSidebarTab === 'people' ? (
                <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--people">
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
                </div>
              ) : null}
              {roomSidebarTab === 'room' ? (
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
                      Hosting tips &amp; FAQ
                    </Link>
                  ) : null}
                  {shareHint ? <span className="riffsync-room-page__hint">{shareHint}</span> : null}
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
