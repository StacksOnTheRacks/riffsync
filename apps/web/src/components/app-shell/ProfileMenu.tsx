import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchFanProfile } from '../../api/fanProfileApi'
import { navigateToFanAuth } from '../../auth/fanAuthNavigation'
import { startFanHostedUiSignOut } from '../../auth/fanHostedUiPkce'
import { useFanSession } from '../../auth/useFanSession'
import { FanAvatarThumb } from '../FanAvatarThumb'

export function ProfileMenu() {
  const { fanToken } = useFanSession()
  const location = useLocation()
  const returnPath = `${location.pathname}${location.search}` || '/'
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<{
    token: string
    displayName: string
    avatarUrl: string | null
  } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const displayName = profile?.token === fanToken ? profile.displayName : 'Account'
  const avatarUrl = profile?.token === fanToken ? profile.avatarUrl : null

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])

  const toggleMenu = useCallback(() => {
    setOpen((current) => !current)
  }, [])

  const onSignIn = () => {
    navigateToFanAuth('/auth/sign-in', returnPath)
  }

  const onSignOut = () => {
    startFanHostedUiSignOut()
  }

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
    if (!fanToken) {
      return
    }

    let cancelled = false
    void fetchFanProfile(fanToken)
      .then((next) => {
        if (cancelled) return
        setProfile({
          token: fanToken,
          displayName: next.displayName?.trim() || 'Account',
          avatarUrl: next.avatarUrl,
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [fanToken])

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      const root = triggerRef.current?.closest('.riffsync-app-shell-profile')
      if (root && !root.contains(target)) {
        closeMenu()
      }
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
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
  }, [closeMenu, open])

  if (!fanToken) {
    return (
      <button
        type="button"
        className="riffsync-app-shell-profile-sign-in"
        aria-label="Sign In"
        onClick={onSignIn}
      >
        <span className="riffsync-app-shell-topbar-icon">
          <img src="/app-shell/topbar/login.svg" alt="" width={24} height={24} />
        </span>
      </button>
    )
  }

  return (
    <div className="riffsync-app-shell-profile">
      <button
        ref={triggerRef}
        type="button"
        className="riffsync-app-shell-profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Profile menu"
        onClick={toggleMenu}
        onKeyDown={onTriggerKeyDown}
      >
        <FanAvatarThumb displayName={displayName} avatarUrl={avatarUrl} sizePx={32} />
      </button>
      {open ? (
        <ul id={panelId} className="riffsync-app-shell-profile-menu" role="menu">
          <li role="none">
            <Link to="/your-parties" role="menuitem" onClick={closeMenu}>
              Your Parties
            </Link>
          </li>
          <li role="none">
            <Link to="/account" role="menuitem" onClick={closeMenu}>
              Profile
            </Link>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={onSignOut}>
              Sign Out
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}
