import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { FanAvatarThumb } from '../components/FanAvatarThumb'
import { PeopleRowAvIndicators } from './PeopleRowAvIndicators'
import {
  peopleFriendMenuPrimaryDisabled,
  peopleFriendMenuPrimaryLabel,
  resolvePeopleFriendMenuState,
  type PeopleFriendMenuState,
} from './peopleRosterFriendState'
import type { FriendRosterSnapshot } from '../friends/friendsApi'
import type { PresenceMember } from './roomPageTypes'
import type { ParticipantProducerSnapshot } from './participantProducerRegistry'

type PeopleRosterRowProps = {
  member: PresenceMember
  sessionId: string
  peopleAvatarUrl: string | undefined
  producerSnapshot: ParticipantProducerSnapshot
  speaking: boolean
  showAvIndicators: boolean
  rowClassName: string
  myFanSub: string | undefined
  snapshot: FriendRosterSnapshot | null
  statusMessage: string | null
  onInvitePeer: (peerFanSub: string) => void
  onCancelPeerRequest: (peerFanSub: string, requestId: string) => void
}

export function PeopleRosterRow({
  member,
  sessionId,
  peopleAvatarUrl,
  producerSnapshot,
  speaking,
  showAvIndicators,
  rowClassName,
  myFanSub,
  snapshot,
  statusMessage,
  onInvitePeer,
  onCancelPeerRequest,
}: PeopleRosterRowProps) {
  const menuId = useId()
  const rowRef = useRef<HTMLLIElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const peerFanSub = member.fanSub
  const inviteEligible =
    Boolean(myFanSub) &&
    Boolean(peerFanSub) &&
    peerFanSub !== myFanSub &&
    Boolean(snapshot)

  const menuState: PeopleFriendMenuState | null =
    inviteEligible && snapshot && peerFanSub
      ? resolvePeopleFriendMenuState(peerFanSub, snapshot)
      : null

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
  }, [])

  const openMenu = useCallback(() => {
    if (!menuState) return
    setMenuOpen(true)
  }, [menuState])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rowRef.current?.contains(target)) return
      closeMenu()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [closeMenu, menuOpen])

  const onRowContextMenu = (event: MouseEvent<HTMLLIElement>) => {
    if (!menuState) return
    event.preventDefault()
    openMenu()
  }

  const onRowKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (!menuState) return
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      openMenu()
      return
    }
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault()
      closeMenu()
    }
  }

  const onPrimaryMenuAction = () => {
    if (!menuState || !peerFanSub) return
    if (menuState.kind === 'add_friend') {
      onInvitePeer(peerFanSub)
    } else if (menuState.kind === 'cancel_request') {
      onCancelPeerRequest(peerFanSub, menuState.requestId)
    }
    closeMenu()
  }

  const primaryDisabled = menuState ? peopleFriendMenuPrimaryDisabled(menuState) : true

  return (
    <li
      ref={rowRef}
      className={rowClassName}
      onContextMenu={onRowContextMenu}
      onKeyDown={onRowKeyDown}
      tabIndex={menuState ? 0 : undefined}
    >
      <div className="riffsync-room-page__people-row-inner">
        <span className="riffsync-room-page__person-label">
          <FanAvatarThumb displayName={member.displayName} avatarUrl={peopleAvatarUrl} />
          <span className="riffsync-room-page__person-name">
            {member.isHost ? (
              <>
                <strong>{member.displayName}</strong>
                <span className="riffsync-room-page__host-badge" aria-label="Host">
                  Host
                </span>
              </>
            ) : (
              member.displayName
            )}
            {member.sessionId === sessionId ? <span className="riffsync-muted"> · you</span> : null}
            {member.active ? (
              <span className="riffsync-room-page__active-badge" aria-label="Active">
                <span className="riffsync-room-page__active-dot" aria-hidden="true" />
                Active
              </span>
            ) : null}
            {speaking ? (
              <span className="riffsync-room-page__speaking-badge" aria-hidden="true">
                Speaking
              </span>
            ) : null}
          </span>
          {showAvIndicators ? (
            <PeopleRowAvIndicators snapshot={producerSnapshot} speaking={speaking} />
          ) : null}
        </span>
        {menuState ? (
          <div className="riffsync-room-page__people-row-actions">
            <button
              type="button"
              className="riffsync-room-page__people-row-overflow"
              aria-label={`More actions for ${member.displayName}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => (menuOpen ? closeMenu() : openMenu())}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                id={menuId}
                className="riffsync-room-page__people-row-menu"
                role="menu"
                aria-label={`Actions for ${member.displayName}`}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="riffsync-room-page__people-row-menu-item"
                  disabled={primaryDisabled}
                  onClick={onPrimaryMenuAction}
                >
                  {peopleFriendMenuPrimaryLabel(menuState)}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {statusMessage ? (
        <p className="riffsync-room-page__people-row-status riffsync-muted" role="status" aria-live="polite">
          {statusMessage}
        </p>
      ) : null}
    </li>
  )
}
