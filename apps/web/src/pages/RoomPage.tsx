import { Link, useParams } from 'react-router-dom'
import type { MutableRefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomPatchResult, RoomSnapshot } from '../api/roomsApi'
import {
  catalogToRoomPlayback,
  fetchRoom,
  patchRoom,
  roomPlaybackForBadge,
} from '../api/roomsApi'
import { fetchCatalogEpisodeById, fetchCatalogEntries } from '../catalog/catalogApi'
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
import { PlaybackExpectationBadge } from '../components/watch/PlaybackExpectationBadge'
import { SoloYouTubePlayer } from '../components/watch/SoloYouTubePlayer'

type ChatMsg = { sessionId: string; text: string; ts: number }

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
  const [catalogList, setCatalogList] = useState<CatalogEpisode[]>([])
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [patchErr, setPatchErr] = useState<string | null>(null)
  const [shareHint, setShareHint] = useState<string | null>(null)
  const [captureErr, setCaptureErr] = useState<string | null>(null)
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null)
  const [guestRemote, setGuestRemote] = useState<MediaStream | null>(null)
  const [guestPlayHint, setGuestPlayHint] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const peerByGuestRef = useRef(new Map<string, RTCPeerConnection>())
  const pendingReadyGuestsRef = useRef(new Set<string>())
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
  }, [roomId])

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
    if (!isPublisher) return
    void fetchCatalogEntries()
      .then(setCatalogList)
      .catch(() => setCatalogList([]))
  }, [isPublisher])

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
    [captureStream, iceServers, isPublisher, sessionId],
  )

  const { status: wsStatus, sendJson: wsSendJson } = useRoomWebSocket({
    url: wsBase,
    roomId,
    sessionId,
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
    if (!captureStream || !isPublisher) return
    void flushHostPending({
      captureStream,
      iceServers,
      sendJson: (payload) => sendJsonRef.current(payload),
      peerByGuestRef,
      pendingReadyGuestsRef,
    }).catch(() => undefined)
  }, [captureStream, iceServers, isPublisher])

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

  const startCapture = async () => {
    setCaptureErr(null)
    try {
      // Chrome defaults `selfBrowserSurface` to "exclude", which omits the *current* tab from the
      // "Chrome Tab" picker—bad for hosts who want this same tab (embedded player). See:
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
      stream.getTracks().forEach((tr) => {
        tr.addEventListener('ended', () => {
          stream.getTracks().forEach((x) => x.stop())
          setCaptureStream(null)
        })
      })
      setCaptureStream(stream)
    } catch (e) {
      setCaptureErr(e instanceof Error ? e.message : 'Could not start tab capture')
    }
  }

  const sendChat = () => {
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

  const onEpisodeChange = async (nextId: string) => {
    if (!room || !fanToken || !isPublisher) return
    setPatchErr(null)
    const ep = catalogList.find((e) => e.id === nextId)
    try {
      const body: Parameters<typeof patchRoom>[2] = { catalogEpisodeId: nextId }
      if (ep) {
        body.playbackExpectation = catalogToRoomPlayback(ep)
      }
      const res: RoomPatchResult = await patchRoom(fanToken, roomId, body)
      setRoom({
        ...room,
        catalogEpisodeId: res.catalogEpisodeId,
        youtubeVideoId: res.youtubeVideoId,
        version: res.version,
        lastActivityAt: res.lastActivityAt,
        visibility: res.visibility,
      })
      void fetchCatalogEpisodeById(res.catalogEpisodeId).then(setCatalogEp)
    } catch (e) {
      setPatchErr(e instanceof Error ? e.message : 'Patch failed')
    }
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

  const title = catalogEp?.title ?? room.catalogEpisodeId

  return (
    <div className="container riffsync-room-page">
      <h1>{title}</h1>
      <p className="riffsync-room-page__meta">
        You are <strong>{displayName}</strong> (<code>{sessionId.slice(0, 8)}…</code>){' '}
        {isPublisher ? <span>— hosting</span> : <span>— guest</span>}
      </p>
      <p>
        <PlaybackExpectationBadge expectation={roomPlaybackForBadge(room.playbackExpectation)} />
      </p>

      {!wsBase && (
        <p role="status" className="riffsync-muted">
          Set <code>VITE_PUBLIC_WS_URL</code> for chat and synchronized watch parties.
        </p>
      )}
      {wsBase ? (
        <p className="riffsync-muted" role="status">
          Realtime: <code>{wsStatus}</code>
        </p>
      ) : null}

      <p>
        <button type="button" className="gen-button" onClick={() => void copyShare()}>
          Copy room link
        </button>
        {shareHint ? <span className="riffsync-room-page__hint"> {shareHint}</span> : null}
      </p>

      {isPublisher ? (
        <section className="riffsync-room-page__host" aria-label="Host controls">
          <h2>Host</h2>
          {patchErr ? <p role="alert">{patchErr}</p> : null}
          <div className="riffsync-room-page__picker">
            <label htmlFor="episode-picker">Episode</label>
            <select
              id="episode-picker"
              value={room.catalogEpisodeId}
              onChange={(e) => void onEpisodeChange(e.target.value)}
              disabled={catalogList.length === 0}
            >
              {catalogList.map((e) => (
                <option key={e.id} value={e.id}>
                  #{e.experimentNumber} — {e.title}
                </option>
              ))}
            </select>
          </div>
          <p>
            <button type="button" className="gen-button" onClick={() => void startCapture()}>
              Share this tab (video + audio)
            </button>
          </p>
          {captureErr ? <p role="alert">{captureErr}</p> : null}
          <p className="riffsync-muted">
            Capture the browser tab showing the embedded player so guests receive one consistent picture—including any on-screen honor-system cues. If
            you still don&apos;t see this tab in the picker, use <strong>Window</strong> and choose this Chrome window, or share another tab that has the
            video full screen.
          </p>
          <div className="riffsync-room-page__embed">
            <SoloYouTubePlayer key={room.youtubeVideoId} videoId={room.youtubeVideoId} titleHint={title} />
          </div>
        </section>
      ) : (
        <>
          <p>
            You are viewing the host&apos;s shared tab. If playback does not start automatically, tap Play (
            autoplay/browser policies).
          </p>
          {guestPlayHint ? (
            <p>
              <button type="button" className="gen-button" onClick={() => void playGuestVideo()}>
                Play video
              </button>
            </p>
          ) : null}
          <video
            ref={videoRef}
            className="riffsync-room-page__guest-video"
            playsInline
            controls
            muted={false}
          />
          <p className="riffsync-muted">
            {fanToken ? (
              <>You are signed in, but only the party creator can administer this room.</>
            ) : (
              <>
                Hosts sign in with Facebook via Cognito to create rooms.{' '}
                <button
                  type="button"
                  className="gen-button"
                  onClick={() =>
                    void startFanHostedUiSignIn(`/room/${encodeURIComponent(roomId)}`).catch(console.error)
                  }
                >
                  Sign in (optional)
                </button>
              </>
            )}
          </p>
        </>
      )}

      <section className="riffsync-room-page__chat" aria-label="Chat">
        <h2>Chat</h2>
        <ul className="riffsync-room-chat-log">
          {chat.map((m) => (
            <li key={`${m.sessionId}:${m.ts}:${m.text.slice(0, 12)}`}>
              <span className="riffsync-room-chat-log__who">{m.sessionId.slice(0, 6)}…</span>
              {': '}
              {m.text}
            </li>
          ))}
        </ul>
        <div className="riffsync-room-chat-compose">
          <input
            type="text"
            maxLength={2000}
            value={chatDraft}
            placeholder="Say something…"
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendChat()
            }}
          />
          <button type="button" className="gen-button" onClick={sendChat}>
            Send
          </button>
        </div>
      </section>

      <p>
        <Link to="/lobby">← Lobby</Link>
      </p>
    </div>
  )
}
