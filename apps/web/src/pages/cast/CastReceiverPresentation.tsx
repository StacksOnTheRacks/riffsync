import { useEffect, useRef } from 'react'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import { ChatOverlayMessageList, type ChatOverlayMessage } from '../../room/ChatOverlayMessageList'
import { CAST_RECEIVER_COPY, resolveCastReceiverStagePlaceholder } from './castReceiverCopy'

type CastReceiverChatOverlayProps = {
  messages: CastChatOverlayLine[]
}

export function CastReceiverChatOverlay({ messages }: CastReceiverChatOverlayProps) {
  const chatLogRef = useRef<HTMLUListElement | null>(null)
  const overlayMessages: ChatOverlayMessage[] = messages.map((line) => ({
    id: line.id,
    kind: line.kind,
    text: line.text,
    senderLabel: line.senderLabel,
  }))

  useEffect(() => {
    const chatLog = chatLogRef.current
    if (!chatLog) return
    chatLog.scrollTop = chatLog.scrollHeight
  }, [messages])

  return (
    <section
      className="riffsync-cast-receiver__chat-overlay"
      aria-label="Chat overlay"
      data-testid="cast-receiver-chat-overlay"
    >
      <ChatOverlayMessageList
        ref={chatLogRef}
        variant="cast"
        messages={overlayMessages}
      />
    </section>
  )
}

type CastReceiverStagePrimaryProps = {
  snapshot: CastPresentationSnapshot
  liveStream: MediaStream | null
}

export function CastReceiverStagePrimary({ snapshot, liveStream }: CastReceiverStagePrimaryProps) {
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

  if (stagePrimary.kind === 'youtube_embed' && stagePrimary.youtubeVideoId) {
    const src = `https://www.youtube.com/embed/${encodeURIComponent(stagePrimary.youtubeVideoId)}?playsinline=1`
    return (
      <div
        className="riffsync-cast-receiver__stage-primary riffsync-cast-receiver__stage-primary--youtube"
        data-testid="cast-receiver-stage-primary"
      >
        <iframe
          className="riffsync-cast-receiver__youtube"
          title="Party video"
          src={src}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
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

type CastReceiverPresentationProps = {
  snapshot: CastPresentationSnapshot | null
  chatMessages: CastChatOverlayLine[]
  liveStream?: MediaStream | null
}

export function CastReceiverPresentation({ snapshot, chatMessages, liveStream = null }: CastReceiverPresentationProps) {
  if (!snapshot) {
    return (
      <div className="riffsync-cast-receiver" aria-busy="true">
        <p className="riffsync-cast-receiver__waiting" role="status">
          {CAST_RECEIVER_COPY.waitingForPresentation}
        </p>
      </div>
    )
  }

  return (
    <div className="riffsync-cast-receiver" data-testid="cast-receiver-presentation">
      <div className="riffsync-cast-receiver__stage">
        <CastReceiverStagePrimary snapshot={snapshot} liveStream={liveStream} />
        <CastReceiverChatOverlay messages={chatMessages} />
      </div>
    </div>
  )
}
