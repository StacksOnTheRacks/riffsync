import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  startFanHostedUiSignIn,
  startFanHostedUiSignOut,
} from '../../auth/fanHostedUiPkce'
import { useFanSession } from '../../auth/useFanSession'

export function ProfileMenu() {
  const { fanToken } = useFanSession()
  const location = useLocation()
  const returnPath = `${location.pathname}${location.search}` || '/'
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])

  const toggleMenu = useCallback(() => {
    setOpen((current) => !current)
  }, [])

  const onSignIn = () => {
    void startFanHostedUiSignIn(returnPath).catch(console.error)
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
        onClick={onSignIn}
      >
        Sign In
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
        aria-label="Account menu"
        onClick={toggleMenu}
        onKeyDown={onTriggerKeyDown}
      >
        <i className="fa fa-user" aria-hidden />
        <span className="riffsync-app-shell-profile-trigger-label">Account</span>
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
              Account
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
