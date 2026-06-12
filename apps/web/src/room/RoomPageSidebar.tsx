import { Link } from 'react-router-dom'
import type { ChangeEvent, RefObject } from 'react'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'
import { FAN_DISPLAY_NAME_MAX_LEN } from '../session/guestSession'
import { FanAvatarThumb } from '../components/FanAvatarThumb'
import { ChatComposeMediaPicker } from './ChatComposeMediaPicker'
import { ChatReactionsStrip } from './ChatReactionsStrip'
import { ParticipantAvToggles } from './ParticipantAvToggles'
import { isEmojiOnlyChatMessage } from './chatEmojiDisplay'
import { isContinuedChatLine } from './chatMessageGrouping'
import type { ReactionsByMessage } from './chatReactions'
import type { ParticipantAvController } from './sfu/participantAvSession'
import type { ChatLine, PresenceMember, RoomSidebarTab } from './roomPageTypes'
import { resolveMemberAvatarUrl } from './roomPageTypes'
import type { GiphySearchResult } from '../api/giphySearchApi'
import {
  RIFFSYNC_CHAT_COMPOSE_STATUS_ID,
  RIFFSYNC_CHAT_DRAWER_STATUS_ID,
} from './drawerErrorPresentation'

type RoomPageSidebarProps = {
  wsBase: string | undefined
  fanToken: string | null
  roomId: string
  sessionId: string
  myAvatarUrl: string | null
  activeSidebarTab: RoomSidebarTab
  setRoomSidebarTab: (tab: RoomSidebarTab) => void
  viewerCount: number
  chat: ChatLine[]
  chatReactions: ReactionsByMessage
  chatMemberLabels: Map<string, string>
  chatDraft: string
  setChatDraft: (draft: string) => void
  chatLogRef: RefObject<HTMLUListElement | null>
  chatInputRef: RefObject<HTMLInputElement | null>
  showJumpToLatest: boolean
  jumpToLatestLabel: string
  jumpToLatest: () => void
  chatDrawerBanner: string | null
  chatComposeStatus: { message: string | null; disableSubmit: boolean }
  sendChat: () => void
  sendChatGif: (result: GiphySearchResult) => void
  toggleChatReaction: (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => void
  peopleShown: PresenceMember[]
  isPublisher: boolean
  shareHint: string | null
  onCopyShare: () => void
  onOpenRenameModal: () => void
  avDisabled: boolean
  participantAvController: ParticipantAvController
  announceRoomA11y: (message: string) => void
  profileDraft: string
  setProfileDraft: (draft: string) => void
  profileSaveErr: string | null
  profileSaving: boolean
  profileAvatarUrl: string | null
  profileAvatarLoading: boolean
  profileAvatarUploading: boolean
  profileAvatarErr: string | null
  profileAvatarInputRef: RefObject<HTMLInputElement | null>
  saveProfileDisplayName: () => void
  onProfileAvatarSelected: (e: ChangeEvent<HTMLInputElement>) => void
}

export function RoomPageSidebar({
  wsBase,
  fanToken,
  roomId,
  sessionId,
  myAvatarUrl,
  activeSidebarTab,
  setRoomSidebarTab,
  viewerCount,
  chat,
  chatReactions,
  chatMemberLabels,
  chatDraft,
  setChatDraft,
  chatLogRef,
  chatInputRef,
  showJumpToLatest,
  jumpToLatestLabel,
  jumpToLatest,
  chatDrawerBanner,
  chatComposeStatus,
  sendChat,
  sendChatGif,
  toggleChatReaction,
  peopleShown,
  isPublisher,
  shareHint,
  onCopyShare,
  onOpenRenameModal,
  avDisabled,
  participantAvController,
  announceRoomA11y,
  profileDraft,
  setProfileDraft,
  profileSaveErr,
  profileSaving,
  profileAvatarUrl,
  profileAvatarLoading,
  profileAvatarUploading,
  profileAvatarErr,
  profileAvatarInputRef,
  saveProfileDisplayName,
  onProfileAvatarSelected,
}: RoomPageSidebarProps) {
  return (
    <aside className="riffsync-room-page__chat-column" aria-label="Room sidebar">
      <section className="riffsync-room-page__chat" aria-label="Chat and viewers">
        {!wsBase ? (
          <p className="riffsync-room-page__ws-banner riffsync-muted" role="status">
            Chat and viewer list require <code>VITE_PUBLIC_WS_URL</code> on this deployment.
          </p>
        ) : null}

        {chatDrawerBanner ? (
          <p
            id={RIFFSYNC_CHAT_DRAWER_STATUS_ID}
            className="riffsync-room-page__ws-banner riffsync-muted"
            role="status"
          >
            {chatDrawerBanner}
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
            <ul ref={chatLogRef} className="riffsync-room-chat-log">
              {chat.map((m, index) => {
                const chatDisplayName =
                  (m.displayName && m.displayName.trim() !== ''
                    ? m.displayName
                    : chatMemberLabels.get(m.sessionId)) ??
                  `${m.sessionId.slice(0, 6)}…`
                const chatAvatarUrl = resolveMemberAvatarUrl(
                  m.sessionId,
                  m.avatarUrl,
                  sessionId,
                  myAvatarUrl,
                )
                const reactionChips = chatReactions[m.messageId] ?? {}
                const isContinued = isContinuedChatLine(chat, index)
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
                          <FanAvatarThumb displayName={chatDisplayName} avatarUrl={chatAvatarUrl} />
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
                          onToggleReaction={toggleChatReaction}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {activeSidebarTab === 'people' ? (
          <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--people">
            <ul className="riffsync-room-page__people-list" aria-label="People currently connected">
              {peopleShown.map((p) => {
                const peopleAvatarUrl = resolveMemberAvatarUrl(
                  p.sessionId,
                  p.avatarUrl,
                  sessionId,
                  myAvatarUrl,
                )
                return (
                  <li
                    key={p.sessionId}
                    className={`riffsync-room-page__people-row${p.isHost ? ' riffsync-room-page__people-row--host' : ''}`}
                  >
                    <span className="riffsync-room-page__person-label">
                      <FanAvatarThumb displayName={p.displayName} avatarUrl={peopleAvatarUrl} />
                      <span className="riffsync-room-page__person-name">
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
                        {p.sessionId === sessionId ? <span className="riffsync-muted"> · you</span> : null}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {activeSidebarTab === 'room' ? (
          <div className="riffsync-room-page__tab-panel riffsync-room-page__room-panel">
            <button type="button" className="gen-button gen-button-wide" onClick={onCopyShare}>
              Copy Party Link
            </button>
            {isPublisher ? (
              <button type="button" className="gen-button gen-button-wide" onClick={onOpenRenameModal}>
                Rename Party
              </button>
            ) : null}
            {isPublisher ? (
              <Link
                className="gen-button gen-button-wide"
                to="/how-to-host-a-watchparty"
                target="_blank"
                rel="noopener noreferrer"
              >
                Hosting Guide
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
            <div className="riffsync-room-page__profile-avatar-block">
              <span className="riffsync-room-page__profile-label" id="riffsync-profile-avatar-label">
                Avatar
              </span>
              <div
                className="riffsync-room-page__profile-avatar-preview"
                aria-labelledby="riffsync-profile-avatar-label"
                aria-busy={profileAvatarLoading || profileAvatarUploading}
              >
                {profileAvatarUrl ? (
                  <img src={profileAvatarUrl} alt="" className="riffsync-room-page__profile-avatar-img" />
                ) : (
                  <span className="riffsync-room-page__profile-avatar-placeholder" aria-hidden>
                    ?
                  </span>
                )}
              </div>
              <input
                ref={profileAvatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="riffsync-room-page__profile-avatar-input"
                onChange={onProfileAvatarSelected}
              />
              <button
                type="button"
                className="gen-button riffsync-room-page__profile-avatar-btn"
                disabled={profileAvatarLoading || profileAvatarUploading}
                onClick={() => profileAvatarInputRef.current?.click()}
              >
                {profileAvatarUploading ? 'Uploading…' : profileAvatarUrl ? 'Replace image' : 'Choose image'}
              </button>
              {profileAvatarErr ? (
                <p className="riffsync-room-page__profile-err" role="alert">
                  {profileAvatarErr}
                </p>
              ) : null}
            </div>
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

        <div className="riffsync-room-page__sidebar-footer">
          {fanToken ? (
            <ParticipantAvToggles
              controller={participantAvController}
              avDisabled={avDisabled}
              onLocalToggleAnnounce={announceRoomA11y}
            />
          ) : null}
          {activeSidebarTab === 'chat' ? (
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
                    draft={chatDraft}
                    onDraftChange={setChatDraft}
                    inputRef={chatInputRef}
                    accessToken={fanToken}
                    onGifSelect={sendChatGif}
                  />
                ) : null}
                <input
                  ref={chatInputRef}
                  type="text"
                  maxLength={2000}
                  value={fanToken ? chatDraft : ''}
                  placeholder="Say something…"
                  disabled={!fanToken}
                  onChange={(e) => {
                    if (fanToken) setChatDraft(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && fanToken && !chatComposeStatus.disableSubmit) sendChat()
                  }}
                />
                <button
                  type="button"
                  className="riffsync-room-chat-compose-send gen-button"
                  disabled={!fanToken || chatComposeStatus.disableSubmit}
                  onClick={sendChat}
                >
                  Send
                </button>
              </div>
              {chatComposeStatus.message ? (
                <p
                  id={RIFFSYNC_CHAT_COMPOSE_STATUS_ID}
                  className="riffsync-room-chat-giphy-status riffsync-room-chat-giphy-status--err"
                  role="status"
                >
                  {chatComposeStatus.message}
                </p>
              ) : null}
              {!fanToken ? (
                <div className="riffsync-room-chat-signin-overlay" role="region" aria-label="Sign in to participate in chat">
                  <button
                    type="button"
                    className="gen-button"
                    onClick={() =>
                      void startFanHostedUiSignIn(`/room/${encodeURIComponent(roomId)}`).catch(console.error)
                    }
                  >
                    Sign In to Chat
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </aside>
  )
}
