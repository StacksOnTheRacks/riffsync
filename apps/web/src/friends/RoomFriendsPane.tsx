import { useEffect, useRef } from 'react'
import { FanAvatarThumb } from '../components/FanAvatarThumb'
import { useChatLogStickToBottom } from '../room/useChatLogStickToBottom'
import { cognitoSub } from '../auth/jwtDecode'
import type { FriendEntry, FriendRequestEntry } from './friendsApi'
import { requireFanAccessToken } from './requireFanAccessToken'
import type { RoomFriendsPaneState } from './useRoomFriendsPane'

type RoomFriendsPaneProps = {
  pane: RoomFriendsPaneState
  visible: boolean
}

export function RoomFriendsPane({ pane, visible }: RoomFriendsPaneProps) {
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const openedFromRowRef = useRef<HTMLButtonElement | null>(null)
  const removeFromButtonRef = useRef<HTMLButtonElement | null>(null)
  const fanToken = requireFanAccessToken()
  const myFanSub = fanToken ? cognitoSub(fanToken) : undefined

  const dmSurfaceKey = pane.openPeer ? `dm:${pane.openPeer.pairKey}` : 'list'
  const {
    logRef: dmLogRef,
    showJumpToLatest,
    jumpToLatestLabel,
    jumpToLatest,
  } = useChatLogStickToBottom(pane.dmMessages.length, Boolean(pane.openPeer && visible), dmSurfaceKey)

  useEffect(() => {
    if (!visible || !pane.openPeer) return
    backButtonRef.current?.focus()
  }, [visible, pane.openPeer])

  useEffect(() => {
    if (visible || !openedFromRowRef.current) return
    openedFromRowRef.current.focus()
    openedFromRowRef.current = null
  }, [visible])

  if (!visible) return null

  if (pane.openPeer) {
    return (
      <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--friends riffsync-room-friends-pane">
        <div className="riffsync-room-friends-dm-header">
          <button
            ref={backButtonRef}
            type="button"
            className="riffsync-room-friends-dm-back gen-button"
            aria-label="Back to friends"
            onClick={pane.closeDm}
          >
            Back to friends
          </button>
          <span className="riffsync-room-friends-dm-peer">{pane.openPeer.displayName}</span>
        </div>
        {pane.dmLoading ? (
          <p className="riffsync-muted riffsync-room-friends-status" role="status">
            Loading messages…
          </p>
        ) : null}
        {pane.dmClosed ? (
          <p className="riffsync-room-friends-closed" role="status">
            This conversation is closed.
          </p>
        ) : (
          <>
            <ul
              ref={dmLogRef}
              className="riffsync-room-chat-log riffsync-room-friends-dm-log"
              aria-label={`Direct messages with ${pane.openPeer.displayName}`}
            >
              {pane.dmMessages.length === 0 && !pane.dmLoading ? (
                <li className="riffsync-room-friends-empty">
                  <p role="status">No messages yet. Say hello.</p>
                </li>
              ) : null}
              {pane.dmMessages.map((message) => {
                const isMine = message.senderSub === myFanSub
                return (
                  <li
                    key={message.messageId}
                    className={`riffsync-room-chat-log__row${isMine ? ' riffsync-room-chat-log__row--mine' : ' riffsync-room-chat-log__row--theirs'}`}
                  >
                    <div className="riffsync-room-chat-log__entry">
                      <div className="riffsync-room-chat-log__bubble">
                        <div className="riffsync-room-chat-log__body">{message.body}</div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
            {showJumpToLatest ? (
              <button
                type="button"
                className="riffsync-room-chat-jump-latest gen-button riffsync-room-friends-dm-jump"
                aria-label="Jump to latest messages"
                onClick={jumpToLatest}
              >
                {jumpToLatestLabel}
              </button>
            ) : null}
            <div className="riffsync-room-friends-dm-compose">
              <input
                type="text"
                maxLength={2000}
                value={pane.dmDraft}
                placeholder="Say something…"
                aria-label="Direct message"
                onChange={(e) => pane.setDmDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void pane.sendDm()
                }}
              />
              <button type="button" className="gen-button" onClick={() => void pane.sendDm()}>
                Send
              </button>
            </div>
            {pane.dmComposeError ? (
              <p className="riffsync-room-friends-dm-err" role="status" aria-live="polite">
                {pane.dmComposeError}
              </p>
            ) : null}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="riffsync-room-page__tab-panel riffsync-room-page__tab-panel--friends riffsync-room-friends-pane">
      {pane.loading ? (
        <p className="riffsync-muted riffsync-room-friends-status" role="status">
          Loading friends…
        </p>
      ) : null}
      {pane.loadError ? (
        <div className="riffsync-room-friends-load-err">
          <p role="alert">Could not load friends. Try again.</p>
          <button type="button" className="gen-button" onClick={() => pane.refreshRoster()}>
            Try again
          </button>
        </div>
      ) : null}
      {!pane.loading && !pane.loadError ? (
        <>
          {pane.snapshot &&
          (pane.snapshot.inbound.length > 0 || pane.snapshot.outbound.length > 0) ? (
            <section className="riffsync-room-friends-section" aria-label="Pending friend requests">
              <h3 className="riffsync-room-friends-section-title">Pending requests</h3>
              <ul className="riffsync-room-friends-list">
                {pane.snapshot.inbound.map((request) => (
                  <li key={request.requestId} className="riffsync-room-friends-row">
                    <PendingRequestIdentity request={request} />
                    <div className="riffsync-room-friends-row-actions">
                      <button
                        type="button"
                        className="gen-button"
                        onClick={() => void pane.acceptRequest(request.requestId)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="gen-button"
                        onClick={() => void pane.declineRequest(request.requestId)}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
                {pane.snapshot.outbound.map((request) => (
                  <li key={request.requestId} className="riffsync-room-friends-row">
                    <PendingRequestIdentity request={request} />
                    <div className="riffsync-room-friends-row-actions">
                      <button
                        type="button"
                        className="gen-button"
                        onClick={() => void pane.cancelRequest(request.requestId)}
                      >
                        Cancel request
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {pane.snapshot && pane.snapshot.friends.length > 0 ? (
            <ul className="riffsync-room-friends-list" aria-label="Friends">
              {pane.snapshot.friends.map((friend) => (
                <FriendRow
                  key={friend.pairKey}
                  friend={friend}
                  onOpenDm={(rowRef) => {
                    openedFromRowRef.current = rowRef
                    pane.openDm(friend)
                  }}
                  onRemove={(rowRef) => {
                    removeFromButtonRef.current = rowRef
                    pane.confirmRemove(friend)
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="riffsync-room-friends-empty" role="status">
              No friends yet.
            </p>
          )}
        </>
      ) : null}
      {pane.removeTarget ? (
        <RemoveFriendDialog
          displayName={pane.removeTarget.displayName}
          onCancel={() => {
            pane.cancelRemove()
            removeFromButtonRef.current?.focus()
            removeFromButtonRef.current = null
          }}
          onConfirm={() => void pane.executeRemove()}
        />
      ) : null}
    </div>
  )
}

function PendingRequestIdentity({ request }: { request: FriendRequestEntry }) {
  return (
    <>
      <FanAvatarThumb displayName={request.displayName} avatarUrl={request.avatarUrl} />
      <span className="riffsync-room-friends-row-name">{request.displayName}</span>
    </>
  )
}

function FriendRow({
  friend,
  onOpenDm,
  onRemove,
}: {
  friend: FriendEntry
  onOpenDm: (rowRef: HTMLButtonElement) => void
  onRemove: (rowRef: HTMLButtonElement) => void
}) {
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const removeButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <li className="riffsync-room-friends-row">
      <FanAvatarThumb displayName={friend.displayName} avatarUrl={friend.avatarUrl} />
      <div className="riffsync-room-friends-row-main">
        <button
          ref={openButtonRef}
          type="button"
          className="riffsync-room-friends-row-open"
          onClick={() => {
            if (openButtonRef.current) onOpenDm(openButtonRef.current)
          }}
        >
          <span className="riffsync-room-friends-row-name">{friend.displayName}</span>
          {friend.hasUnread ? (
            <span className="riffsync-room-friends-unread-dot" aria-label="Unread messages" />
          ) : null}
        </button>
        {friend.online ? (
          <span className="riffsync-room-friends-online riffsync-muted">
            <span className="riffsync-room-friends-online-dot" aria-hidden />
            Online in a watch party
          </span>
        ) : null}
      </div>
      <button
        ref={removeButtonRef}
        type="button"
        className="riffsync-room-friends-remove gen-button"
        aria-label={`Remove ${friend.displayName}`}
        onClick={() => {
          if (removeButtonRef.current) onRemove(removeButtonRef.current)
        }}
      >
        Remove
      </button>
    </li>
  )
}

function RemoveFriendDialog({
  displayName,
  onCancel,
  onConfirm,
}: {
  displayName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      className="riffsync-room-friends-remove-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-friend-title"
    >
      <div className="riffsync-room-friends-remove-dialog-panel">
        <h2 id="remove-friend-title">Remove friend?</h2>
        <p>
          This removes {displayName} for both of you. You will not be able to message each other unless you
          become friends again.
        </p>
        <div className="riffsync-room-friends-remove-dialog-actions">
          <button ref={cancelButtonRef} type="button" className="gen-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="gen-button riffsync-room-friends-remove-confirm" onClick={onConfirm}>
            Remove friend
          </button>
        </div>
      </div>
    </div>
  )
}
