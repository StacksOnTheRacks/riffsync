import { useRef } from 'react'
import type { GiphySearchResult } from '../api/giphySearchApi'
import { ChatComposeMediaPicker } from '../room/ChatComposeMediaPicker'
import { isEmojiOnlyChatMessage } from '../room/chatEmojiDisplay'
import type { DmMessage } from './dmApi'

type FriendsDmComposeProps = {
  accessToken: string
  draft: string
  setDraft: (draft: string) => void
  sendDm: () => void
  sendDmGif: (result: GiphySearchResult) => void
}

export function FriendsDmCompose({
  accessToken,
  draft,
  setDraft,
  sendDm,
  sendDmGif,
}: FriendsDmComposeProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="riffsync-room-friends-dm-compose">
      <ChatComposeMediaPicker
        draft={draft}
        onDraftChange={setDraft}
        inputRef={inputRef}
        accessToken={accessToken}
        onGifSelect={sendDmGif}
      />
      <input
        ref={inputRef}
        type="text"
        maxLength={2000}
        value={draft}
        placeholder="Say something…"
        aria-label="Direct message"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void sendDm()
        }}
      />
      <button type="button" className="gen-button" disabled={draft.trim() === ''} onClick={() => void sendDm()}>
        Send
      </button>
    </div>
  )
}

export function FriendsDmMessageBody({ message }: { message: DmMessage }) {
  if (message.kind === 'gif') {
    return (
      <img
        className="riffsync-room-chat-log__gif-img"
        src={message.renditionUrl}
        alt={message.title?.trim() || 'GIF'}
        loading="lazy"
        width={message.width}
        height={message.height}
      />
    )
  }

  return (
    <div
      className={`riffsync-room-chat-log__body${isEmojiOnlyChatMessage(message.body) ? ' riffsync-room-chat-log__body--emoji-only' : ''}`}
    >
      {message.body}
    </div>
  )
}
