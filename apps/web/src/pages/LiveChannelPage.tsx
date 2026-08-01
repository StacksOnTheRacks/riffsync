import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { LiveChannelSnapshot } from '../api/liveApi'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'
import { useFanSession } from '../auth/useFanSession'
import { SoloYouTubePlayer } from '../components/watch/SoloYouTubePlayer'
import { FanAvatarThumb } from '../components/FanAvatarThumb'
import { getLiveChannelSeed } from '../live/liveChannels'
import { useLiveChannelQuery } from '../live/liveQueries'
import { useLiveChannelChat } from '../live/useLiveChannelChat'
import { ChatComposeMediaPicker } from '../room/ChatComposeMediaPicker'
import { ChatReactionsStrip } from '../room/ChatReactionsStrip'
import { isEmojiOnlyChatMessage } from '../room/chatEmojiDisplay'
import { isContinuedChatLine } from '../room/chatMessageGrouping'
import { formatChatSystemText } from '../room/chatSystemLine'
import { useChatLogStickToBottom } from '../room/useChatLogStickToBottom'
import { ensureGuestSession } from '../session/guestSession'

export function LiveChannelPage() {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = slugParam ? decodeURIComponent(slugParam) : ''
  const seed = getLiveChannelSeed(slug)
  const seedEnabled = Boolean(seed?.enabled)

  const guest = ensureGuestSession('live')
  const [sessionId] = useState(guest.sessionId)
  const [displayName] = useState(guest.displayName)
  const { fanToken } = useFanSession()

  const channelQuery = useLiveChannelQuery(seedEnabled ? slug : undefined)
  const channel = channelQuery.data ?? null
  const loading = seedEnabled && channelQuery.isPending
  const loadError = !seedEnabled
    ? 'Live channel not found'
    : channelQuery.isError
      ? channelQuery.error instanceof Error
        ? channelQuery.error.message
        : 'Live channel unavailable'
      : null

  return (
    <div className="riffsync-live-page">
      <div className="container riffsync-live-page__inner">
        <header className="riffsync-live-page__header">
          <p className="riffsync-live-page__eyebrow">
            <Link to="/">RiffSync</Link> / Live
          </p>
          <h1>{channel?.title ?? seed?.defaultTitle ?? 'Live'}</h1>
          {channel?.tagline ? <p className="text-muted">{channel.tagline}</p> : null}
        </header>

        {loading ? <p role="status">Loading live channel…</p> : null}
        {loadError ? <p role="alert">{loadError}</p> : null}

        {!loading && !loadError && channel ? (
          <LiveChannelReady
            key={channel.roomId}
            slug={slug}
            channel={channel}
            sessionId={sessionId}
            displayName={displayName}
            fanToken={fanToken}
          />
        ) : null}
      </div>
    </div>
  )
}

function LiveChannelReady(props: {
  slug: string
  channel: LiveChannelSnapshot
  sessionId: string
  displayName: string
  fanToken: string | null
}) {
  const { slug, channel, sessionId, displayName, fanToken } = props
  const chatInputRef = useRef<HTMLInputElement>(null)
  const chat = useLiveChannelChat({
    roomId: channel.roomId,
    sessionId,
    displayName,
    fanToken,
    enabled: true,
  })

  const { logRef: chatLogRef, showJumpToLatest, jumpToLatestLabel, jumpToLatest } =
    useChatLogStickToBottom(chat.chat.length, true, channel.roomId)

  const canPlay =
    Boolean(channel.youtubeVideoId) && channel.embedAllows !== false && channel.playbackHost !== 'custom'

  return (
    <>
      {chat.presenceCount > 0 ? (
        <p className="riffsync-live-page__presence text-muted" aria-live="polite">
          {chat.presenceCount} watching
        </p>
      ) : null}

      <div className="riffsync-live-page__layout">
        <section className="riffsync-live-page__stage" aria-label="Live video">
          {canPlay && channel.youtubeVideoId ? (
            <SoloYouTubePlayer
              videoId={channel.youtubeVideoId}
              titleHint={channel.title}
              autoPlay
            />
          ) : (
            <p role="status">
              Playback unavailable for this live channel.
              {channel.youtubeWatchUrl ? (
                <>
                  {' '}
                  <a href={channel.youtubeWatchUrl} rel="noreferrer" target="_blank">
                    Open on YouTube
                  </a>
                </>
              ) : null}
            </p>
          )}
        </section>

        <aside className="riffsync-live-page__chat riffsync-room-page__chat-column" aria-label="Live chat">
          <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--chat">
            <ul ref={chatLogRef} className="riffsync-room-chat-log">
              {chat.chat.map((m, index) => {
                if (m.kind === 'system') {
                  return (
                    <li
                      key={m.messageId}
                      className="riffsync-room-chat-log__row riffsync-room-chat-log__row--system"
                    >
                      <p className="riffsync-room-chat-log__system-line" role="status">
                        {formatChatSystemText(m.displayName, m.systemEvent)}
                      </p>
                    </li>
                  )
                }
                const chatDisplayName =
                  (m.displayName && m.displayName.trim() !== ''
                    ? m.displayName
                    : chat.chatMemberLabels.get(m.sessionId)) ??
                  `${m.sessionId.slice(0, 6)}…`
                const reactionChips = chat.chatReactions[m.messageId] ?? {}
                const isContinued = isContinuedChatLine(chat.chat, index)
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
                          <FanAvatarThumb displayName={chatDisplayName} avatarUrl={m.avatarUrl} />
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
                          onToggleReaction={chat.toggleChatReaction}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
              {chat.remoteTyping.map((entry) => (
                <li
                  key={`typing-${entry.sessionId}`}
                  className="riffsync-room-chat-log__row riffsync-room-chat-log__row--typing"
                >
                  <p className="riffsync-room-chat-log__typing-line" role="status" aria-live="polite">
                    <span className="riffsync-room-chat-log__typing-name">{entry.displayName}</span>
                    <span aria-hidden="true"> is typing</span>
                    <span className="riffsync-room-chat-log__typing-ellipsis" aria-hidden="true">
                      …
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>

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
                  draft={chat.chatDraft}
                  onDraftChange={chat.setChatDraft}
                  inputRef={chatInputRef}
                  accessToken={fanToken}
                  onGifSelect={chat.sendChatGif}
                />
              ) : null}
              <input
                ref={chatInputRef}
                type="text"
                maxLength={2000}
                value={fanToken ? chat.chatDraft : ''}
                placeholder="Say something…"
                disabled={!fanToken}
                onChange={(e) => {
                  if (fanToken) chat.setChatDraft(e.target.value)
                }}
                onBlur={() => {
                  if (fanToken) chat.onComposeBlur()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && fanToken) chat.sendChat()
                }}
              />
              <button
                type="button"
                className="riffsync-room-chat-compose-send gen-button"
                disabled={!fanToken || chat.chatDraft.trim() === ''}
                onClick={chat.sendChat}
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
                    void startFanHostedUiSignIn(`/live/${encodeURIComponent(slug)}`).catch(console.error)
                  }
                >
                  Sign In to Chat
                </button>
              </div>
            ) : null}
          </div>
          <p className="riffsync-live-page__ws-status text-muted" role="status">
            Chat: {chat.wsStatus}
          </p>
        </aside>
      </div>
    </>
  )
}
