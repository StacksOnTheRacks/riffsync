import { useEffect, useMemo, useRef, useState } from 'react'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../room/cast/castChannelProtocol'
import { ChatOverlayMessageList, type ChatOverlayMessage } from '../room/ChatOverlayMessageList'
import {
  CAST_RECEIVER_COPY,
  resolveCastReceiverStagePlaceholder,
} from '../pages/cast/castReceiverCopy'

/** How long a chat line stays on the TV surface after first sight. */
export const TV_CHAT_LINE_TTL_MS = 10_000
/** Final window where the line fades out before removal. */
export const TV_CHAT_LINE_FADE_MS = 800

export type TvClientShellProps = {
  mode: 'waiting' | 'linked'
  pairingCode?: string | null
  pairingError?: string | null
  snapshot: CastPresentationSnapshot | null
  chatMessages: CastChatOverlayLine[]
  liveStream?: MediaStream | null
}

function TvChatOverlay({ messages }: { messages: CastChatOverlayLine[] }) {
  const chatLogRef = useRef<HTMLUListElement | null>(null)
  const firstSeenAtByIdRef = useRef<Map<string, number>>(new Map())
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 250)
    return () => window.clearInterval(timer)
  }, [])

  const overlayMessages: ChatOverlayMessage[] = useMemo(() => {
    const firstSeen = firstSeenAtByIdRef.current
    return messages
      .map((line) => {
        let firstSeenAt = firstSeen.get(line.id)
        if (firstSeenAt === undefined) {
          firstSeenAt = nowMs
          firstSeen.set(line.id, firstSeenAt)
        }
        const ageMs = nowMs - firstSeenAt
        // Keep the first-seen stamp for the session so a later re-push cannot revive the line.
        if (ageMs >= TV_CHAT_LINE_TTL_MS) return null
        return {
          id: line.id,
          kind: line.kind,
          text: line.text,
          senderLabel: line.senderLabel,
          fading: ageMs >= TV_CHAT_LINE_TTL_MS - TV_CHAT_LINE_FADE_MS,
        } satisfies ChatOverlayMessage
      })
      .filter((line): line is ChatOverlayMessage => line !== null)
  }, [messages, nowMs])

  useEffect(() => {
    const chatLog = chatLogRef.current
    if (!chatLog) return
    chatLog.scrollTop = chatLog.scrollHeight
  }, [overlayMessages])

  return (
    <section
      className="riffsync-cast-receiver__chat-overlay"
      aria-label="Chat overlay"
      data-testid="cast-receiver-chat-overlay"
    >
      <ChatOverlayMessageList ref={chatLogRef} variant="cast" messages={overlayMessages} />
    </section>
  )
}

function TvStagePrimary({
  snapshot,
  liveStream,
}: {
  snapshot: CastPresentationSnapshot
  liveStream: MediaStream | null
}) {
  const { stagePrimary } = snapshot
  const liveVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = liveVideoRef.current
    if (!video) return
    video.srcObject = liveStream
    if (!liveStream) return
    if (typeof video.play === 'function') {
      void video.play().catch(() => undefined)
    }
    return () => {
      if (video.srcObject === liveStream) video.srcObject = null
    }
  }, [liveStream])

  if (stagePrimary.kind === 'live_stream') {
    const placeholderCopy = resolveCastReceiverStagePlaceholder({
      kind: 'live_video_placeholder',
      label: stagePrimary.label,
    })
    return (
      <div
        className="riffsync-cast-receiver__stage-primary riffsync-cast-receiver__stage-primary--live"
        data-testid="cast-receiver-stage-primary"
        aria-label={stagePrimary.label ?? 'Party video'}
      >
        <video
          ref={liveVideoRef}
          className="riffsync-cast-receiver__live-video"
          data-testid="cast-receiver-live-video"
          data-tv-playback-path={snapshot.playbackPath ?? 'tv_client_stream'}
          playsInline
          autoPlay
          controls={false}
          muted={false}
        />
        {liveStream ? null : (
          <p className="riffsync-cast-receiver__stage-placeholder" role="status">
            {placeholderCopy}
          </p>
        )}
      </div>
    )
  }

  if (stagePrimary.kind === 'video_chat_grid') {
    return (
      <div
        className="riffsync-cast-receiver__stage-primary riffsync-cast-receiver__stage-primary--grid riffsync-room-page__participant-grid"
        data-testid="cast-receiver-stage-primary"
        aria-label={stagePrimary.label ?? 'Participant cameras'}
      >
        <p className="riffsync-room-page__participant-grid-empty" role="status">
          {stagePrimary.label ?? 'Participant cameras'}
        </p>
      </div>
    )
  }

  // Idle YouTube embed is not the Theater happy path; show waiting placeholder instead of
  // unsynced iframe playback when share is inactive.
  if (stagePrimary.kind === 'youtube_embed') {
    return (
      <div
        className="riffsync-cast-receiver__stage-primary riffsync-cast-receiver__stage-primary--live"
        data-testid="cast-receiver-stage-primary"
        data-tv-playback-path="tv_client_idle_youtube_embed"
        role="img"
        aria-label={CAST_RECEIVER_COPY.waitingForRoomVideo}
      >
        <p className="riffsync-cast-receiver__stage-placeholder">
          {CAST_RECEIVER_COPY.waitingForRoomVideo}
        </p>
      </div>
    )
  }

  const placeholderCopy = resolveCastReceiverStagePlaceholder(stagePrimary)
  return (
    <div
      className="riffsync-cast-receiver__stage-primary riffsync-cast-receiver__stage-primary--live"
      data-testid="cast-receiver-stage-primary"
      role="img"
      aria-label={placeholderCopy}
    >
      <p className="riffsync-cast-receiver__stage-placeholder">{placeholderCopy}</p>
    </div>
  )
}

export function TvClientShell({
  mode,
  pairingCode,
  pairingError,
  snapshot,
  chatMessages,
  liveStream = null,
}: TvClientShellProps) {
  if (mode === 'waiting') {
    return (
      <div className="riffsync-cast-receiver riffsync-tv-client" data-testid="tv-client-waiting">
        <div className="riffsync-tv-client__pairing">
          <p className="riffsync-tv-client__brand">RiffSync</p>
          <p className="riffsync-tv-client__pairing-lede">Enter this code on your phone or computer</p>
          <p className="riffsync-tv-client__pairing-code" aria-live="polite">
            {pairingCode ?? '······'}
          </p>
          <p className="riffsync-tv-client__pairing-hint">
            In the room, tap Link TV and type this code.
          </p>
          {pairingError ? (
            <p className="riffsync-tv-client__pairing-error" role="alert">
              {pairingError}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="riffsync-cast-receiver riffsync-tv-client" aria-busy="true">
        <p className="riffsync-cast-receiver__waiting" role="status">
          {CAST_RECEIVER_COPY.waitingForPresentation}
        </p>
      </div>
    )
  }

  return (
    <div
      className="riffsync-cast-receiver riffsync-tv-client"
      data-testid="cast-receiver-presentation"
      data-tv-playback-path={snapshot.playbackPath}
    >
      <div className="riffsync-cast-receiver__stage">
        <TvStagePrimary snapshot={snapshot} liveStream={liveStream} />
        <TvChatOverlay messages={chatMessages} />
      </div>
    </div>
  )
}
