import { useState } from 'react'
import { NavLink, useLocation, useMatch } from 'react-router-dom'
import {
  startFanHostedUiSignIn,
} from '../../auth/fanHostedUiPkce'
import { useFanSession } from '../../auth/useFanSession'
import { useRoomChromeOptional } from '../../room/useRoomChrome'
import { CatalogNavItem } from './CatalogNavItem'

function PrimaryNavItem({
  to,
  end,
  children,
}: {
  to: string
  /** When false, active for nested paths. Default true (exact). */
  end?: boolean
  children: string
}) {
  const match = useMatch({ path: to, end: end ?? true })
  const active = !!match
  return (
    <li className={`menu-item${active ? ' active' : ''}`}>
      <NavLink to={to} end={end ?? true}>
        {children}
      </NavLink>
    </li>
  )
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const roomChrome = useRoomChromeOptional()
  const nowPlayingLabel = roomChrome?.nowPlayingLabel ?? null
  const { fanToken } = useFanSession()
  const location = useLocation()
  const returnPath = `${location.pathname}${location.search}` || '/'

  const onSignIn = () => {
    void startFanHostedUiSignIn(returnPath).catch(console.error)
  }

  if (compact) {
    return (
      <header
        id="gen-header"
        className="gen-header-style-1 gen-has-sticky gen-header-sticky riffsync-header riffsync-header--compact"
      >
        <div className="gen-bottom-header riffsync-header__compact-strip">
          <div className="container">
            <div className="riffsync-header-compact-inner">
              {nowPlayingLabel ? (
                <p className="riffsync-header-compact-now-playing" aria-live="polite">
                  Now Playing:{` `}
                  <span className="riffsync-header-compact-now-playing-title">{nowPlayingLabel}</span>
                </p>
              ) : null}
              <div className="riffsync-header-compact-brandline">
                <NavLink className="riffsync-brand riffsync-brand--compact" to="/" end>
                  RiffSync
                </NavLink>
                <span className="riffsync-header-compact-sub">Watch Party</span>
              </div>
            </div>
          </div>
        </div>
      </header>
    )
  }

  return (
    <header id="gen-header" className="gen-header-style-1 gen-has-sticky gen-header-sticky riffsync-header">
      <div className="gen-bottom-header">
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <nav className="navbar navbar-expand-lg navbar-light">
                <NavLink className="navbar-brand riffsync-brand" to="/" end>
                  RiffSync
                </NavLink>
                <div
                  className={`collapse navbar-collapse${mobileOpen ? ' show' : ''}`}
                  id="navbarSupportedContent"
                >
                  <div id="gen-menu-contain" className="gen-menu-contain">
                    <ul id="gen-main-menu" className="navbar-nav ml-auto">
                      <PrimaryNavItem to="/" end>
                        Home
                      </PrimaryNavItem>
                      <CatalogNavItem />
                      <PrimaryNavItem to="/lobby">Lobby</PrimaryNavItem>
                      {fanToken ? (
                        <PrimaryNavItem to="/account">Account</PrimaryNavItem>
                      ) : (
                        <li className="menu-item">
                          <button
                            type="button"
                            className="riffsync-site-nav-sign-in"
                            onClick={onSignIn}
                          >
                            Sign In
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
                <button
                  className="navbar-toggler"
                  type="button"
                  onClick={() => setMobileOpen((o) => !o)}
                  aria-controls="navbarSupportedContent"
                  aria-expanded={mobileOpen}
                  aria-label="Toggle navigation"
                >
                  <i className="fas fa-bars" aria-hidden />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
