import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import { CAST_RECEIVER_COPY, resolveCastReceiverStagePlaceholder } from './castReceiverCopy'

type CastReceiverChatOverlayProps = {
  messages: CastChatOverlayLine[]
}

export function CastReceiverChatOverlay({ messages }: CastReceiverChatOverlayProps) {
  return (
    <section
      className="riffsync-cast-receiver__chat-overlay"
      aria-label="Chat overlay"
      data-testid="cast-receiver-chat-overlay"
    >
      {messages.length === 0 ? (
        <p className="riffsync-cast-receiver__chat-empty" role="status">
          {CAST_RECEIVER_COPY.emptyChat}
        </p>
      ) : (
        <ul className="riffsync-cast-receiver__chat-log">
          {messages.map((line) => (
            <li
              key={line.id}
              className={`riffsync-cast-receiver__chat-line riffsync-cast-receiver__chat-line--${line.kind}`}
            >
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type CastReceiverStagePrimaryProps = {
  snapshot: CastPresentationSnapshot
}

export function CastReceiverStagePrimary({ snapshot }: CastReceiverStagePrimaryProps) {
  const { stagePrimary } = snapshot

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
        className="riffsync-cast-receiver__stage-primary riffsync-cast-receiver__stage-primary--grid"
        data-testid="cast-receiver-stage-primary"
        role="img"
        aria-label={stagePrimary.label ?? 'Participant cameras'}
      >
        <p className="riffsync-cast-receiver__stage-placeholder">{stagePrimary.label ?? 'Participant cameras'}</p>
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
}

export function CastReceiverPresentation({ snapshot, chatMessages }: CastReceiverPresentationProps) {
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
        <CastReceiverStagePrimary snapshot={snapshot} />
        <CastReceiverChatOverlay messages={chatMessages} />
      </div>
    </div>
  )
}
