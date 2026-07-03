import { forwardRef } from 'react'
import { FanAvatarThumb } from '../components/FanAvatarThumb'
import type { RemoteTypingEntry } from './roomPageTypes'

export type ChatOverlayMessage = {
  id: string
  kind: 'text' | 'gif' | 'system'
  text: string
  senderLabel?: string
  avatarUrl?: string
  isMine?: boolean
  isContinued?: boolean
  gif?: {
    src: string
    alt: string
    width?: number
    height?: number
  }
}

type ChatOverlayMessageListProps = {
  messages: ChatOverlayMessage[]
  variant: 'room' | 'cast'
  emptyMessage?: string
  typingEntries?: RemoteTypingEntry[]
}

export const ChatOverlayMessageList = forwardRef<HTMLUListElement, ChatOverlayMessageListProps>(
  function ChatOverlayMessageList(
    { messages, variant, emptyMessage, typingEntries = [] },
    ref,
  ) {
    if (messages.length === 0 && typingEntries.length === 0 && emptyMessage) {
      if (variant === 'cast') {
        return (
          <p className="riffsync-cast-receiver__chat-empty" role="status">
            {emptyMessage}
          </p>
        )
      }
      return (
        <p className="riffsync-room-chat-log__empty" role="status">
          {emptyMessage}
        </p>
      )
    }

    if (variant === 'cast') {
      return (
        <ul ref={ref} className="riffsync-cast-receiver__chat-log">
          {messages.map((line) => (
            <li
              key={line.id}
              className={`riffsync-cast-receiver__chat-line riffsync-cast-receiver__chat-line--${line.kind}`}
            >
              {line.text}
            </li>
          ))}
        </ul>
      )
    }

    return (
      <ul ref={ref} className="riffsync-room-chat-log">
        {messages.map((line) => {
          if (line.kind === 'system') {
            return (
              <li
                key={line.id}
                className="riffsync-room-chat-log__row riffsync-room-chat-log__row--system"
              >
                <p className="riffsync-room-chat-log__system-line" role="status">
                  {line.text}
                </p>
              </li>
            )
          }

          const rowClassName = [
            'riffsync-room-chat-log__row',
            line.isMine ? 'riffsync-room-chat-log__row--mine' : 'riffsync-room-chat-log__row--theirs',
            line.isContinued ? 'riffsync-room-chat-log__row--continued' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const showTheirsMeta = !line.isMine && !line.isContinued && line.senderLabel

          return (
            <li key={line.id} className={rowClassName}>
              <div className="riffsync-room-chat-log__entry">
                {showTheirsMeta ? (
                  <div className="riffsync-room-chat-log__meta">
                    <FanAvatarThumb displayName={line.senderLabel!} avatarUrl={line.avatarUrl} />
                    <span className="riffsync-room-chat-log__who-name">{line.senderLabel}</span>
                  </div>
                ) : line.senderLabel ? (
                  <span className="sr-only">{line.senderLabel}: </span>
                ) : null}
                <div className="riffsync-room-chat-log__bubble">
                  {line.gif ? (
                    <img
                      className="riffsync-room-chat-log__gif-img"
                      src={line.gif.src}
                      alt={line.gif.alt}
                      loading="lazy"
                      width={line.gif.width}
                      height={line.gif.height}
                    />
                  ) : (
                    <div className="riffsync-room-chat-log__body">{line.text}</div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
        {typingEntries.map((entry) => (
          <li
            key={`typing-${entry.sessionId}`}
            className="riffsync-room-chat-log__row riffsync-room-chat-log__row--typing"
          >
            <p className="riffsync-room-chat-log__typing-line" role="status" aria-live="polite">
              <span className="riffsync-room-chat-log__typing-name">{entry.displayName}</span>
              <span aria-hidden="true"> is typing</span>
              <span className="riffsync-room-chat-log__typing-ellipsis" aria-hidden="true">
                ...
              </span>
            </p>
          </li>
        ))}
      </ul>
    )
  },
)
