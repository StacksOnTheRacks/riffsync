import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { FanAvatarThumb } from '../components/FanAvatarThumb'
import { useChatLogStickToBottom } from '../room/useChatLogStickToBottom'
import { cognitoSub } from '../auth/jwtDecode'
import type { FriendEntry, FriendRequestEntry } from './friendsApi'
import { requireFanAccessToken } from './requireFanAccessToken'
import { useRoomFriendsPane, type RoomFriendsPaneState } from './useRoomFriendsPane'

/**
 * Main-site person-icon friends entry (#363).
 * Template chrome: `gen-account-holder` / `#gen-user-btn` / `fa-user`.
 */
export function FriendsDropdown() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dmSurfaceOpen, setDmSurfaceOpen] = useState(false)
  const [pendingPeer, setPendingPeer] = useState<FriendEntry | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const fanToken = requireFanAccessToken()
  const pane = useRoomFriendsPane(menuOpen || dmSurfaceOpen, Boolean(fanToken))
  const { closeDm } = pane

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  const toggleMenu = useCallback(() => {
    setMenuOpen((current) => !current)
  }, [])

  const closeDmSurface = useCallback(() => {
    closeDm()
    setPendingPeer(null)
    setDmSurfaceOpen(false)
    triggerRef.current?.focus()
  }, [closeDm])

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleMenu()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      triggerRef.current?.focus()
    }
  }

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current && !rootRef.current.contains(target)) {
        const overlay = document.querySelector('.riffsync-friends-dm-overlay')
        const dialog = document.querySelector('.riffsync-friends-remove-dialog--site')
        if (overlay?.contains(target) || dialog?.contains(target)) return
        closeMenu()
      }
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !pane.openPeer && !pane.removeTarget) {
        event.preventDefault()
        closeMenu()
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closeMenu, menuOpen, pane.openPeer, pane.removeTarget])

  const onOpenDm = (friend: FriendEntry) => {
    closeMenu()
    setPendingPeer(friend)
    setDmSurfaceOpen(true)
    pane.openDm(friend)
  }

  const overlayPeer =
    pane.openPeer ??
    (pendingPeer
      ? {
          fanSub: pendingPeer.fanSub,
          pairKey: pendingPeer.pairKey,
          displayName: pendingPeer.displayName,
          avatarUrl: pendingPeer.avatarUrl,
        }
      : null)

  return (
    <>
      <div className="gen-account-holder riffsync-friends-nav" ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          id="gen-user-btn"
          className="riffsync-friends-nav__trigger"
          aria-label="Friends"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-controls={panelId}
          onClick={toggleMenu}
          onKeyDown={onTriggerKeyDown}
        >
          <i className="fa fa-user" aria-hidden />
          {pane.anyUnread ? (
            <span className="riffsync-friends-nav__unread-dot" aria-label="Unread messages" />
          ) : null}
        </button>
        {menuOpen ? (
          <div
            id={panelId}
            className="riffsync-friends-dropdown gen-account-menu gen-form-show"
            role="region"
            aria-label="Friends"
          >
            <FriendsDropdownList pane={pane} onOpenDm={onOpenDm} />
          </div>
        ) : null}
      </div>
      {dmSurfaceOpen && overlayPeer ? (
        <FriendsDmOverlay pane={pane} peer={overlayPeer} onClose={closeDmSurface} />
      ) : null}
      {pane.removeTarget ? (
        <RemoveFriendDialog
          displayName={pane.removeTarget.displayName}
          onCancel={pane.cancelRemove}
          onConfirm={() => void pane.executeRemove()}
        />
      ) : null}
    </>
  )
}

function FriendsDropdownList({
  pane,
  onOpenDm,
}: {
  pane: RoomFriendsPaneState
  onOpenDm: (friend: FriendEntry) => void
}) {
  return (
    <div className="riffsync-friends-dropdown__body">
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
              <ul className="riffsync-room-friends-list riffsync-room-friends-list--pending">
                {pane.snapshot.inbound.map((request) => (
                  <li key={request.requestId} className="riffsync-room-friends-row riffsync-room-friends-row--pending">
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
                  <li key={request.requestId} className="riffsync-room-friends-row riffsync-room-friends-row--pending">
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
                  onOpenDm={() => onOpenDm(friend)}
                  onRemove={() => pane.confirmRemove(friend)}
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
    </div>
  )
}

function PendingRequestIdentity({ request }: { request: FriendRequestEntry }) {
  return (
    <div className="riffsync-room-friends-pending-identity">
      <FanAvatarThumb displayName={request.displayName} avatarUrl={request.avatarUrl} />
      <span className="riffsync-room-friends-row-name">{request.displayName}</span>
    </div>
  )
}

function FriendRow({
  friend,
  onOpenDm,
  onRemove,
}: {
  friend: FriendEntry
  onOpenDm: () => void
  onRemove: () => void
}) {
  return (
    <li className="riffsync-room-friends-row">
      <FanAvatarThumb displayName={friend.displayName} avatarUrl={friend.avatarUrl} />
      <div className="riffsync-room-friends-row-main">
        <button type="button" className="riffsync-room-friends-row-open" onClick={onOpenDm}>
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
        type="button"
        className="riffsync-room-friends-remove gen-button"
        aria-label={`Remove ${friend.displayName}`}
        onClick={onRemove}
      >
        Remove
      </button>
    </li>
  )
}

function FriendsDmOverlay({
  pane,
  peer,
  onClose,
}: {
  pane: RoomFriendsPaneState
  peer: { fanSub: string; pairKey: string; displayName: string; avatarUrl?: string }
  onClose: () => void
}) {
  const fanToken = requireFanAccessToken()
  const myFanSub = fanToken ? cognitoSub(fanToken) : undefined
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dmSurfaceKey = `site-dm:${peer.pairKey}`
  const {
    logRef: dmLogRef,
    showJumpToLatest,
    jumpToLatestLabel,
    jumpToLatest,
  } = useChatLogStickToBottom(pane.dmMessages.length, Boolean(peer), dmSurfaceKey)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [peer?.pairKey])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !pane.removeTarget) {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, pane.removeTarget])

  return (
    <div
      className="riffsync-friends-dm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Direct messages with ${peer.displayName}`}
    >
      <div className="riffsync-friends-dm-overlay__panel">
        <div className="riffsync-room-friends-dm-header">
          <button
            ref={closeButtonRef}
            type="button"
            className="riffsync-room-friends-dm-back gen-button"
            aria-label="Close conversation"
            onClick={onClose}
          >
            Close
          </button>
          <span className="riffsync-room-friends-dm-peer">{peer.displayName}</span>
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
              aria-label={`Direct messages with ${peer.displayName}`}
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
    </div>
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
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      className="riffsync-room-friends-remove-dialog riffsync-friends-remove-dialog--site"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-remove-friend-title"
    >
      <div className="riffsync-room-friends-remove-dialog-panel">
        <h2 id="site-remove-friend-title">Remove friend?</h2>
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
