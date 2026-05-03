import { useState } from 'react'
import { NavLink, useMatch } from 'react-router-dom'

function PrimaryNavItem({
  to,
  end,
  children,
}: {
  to: string
  /** When false, active for nested paths (e.g. `/admin/*`). Default true (exact). */
  end?: boolean
  children: string
}) {
  const match = useMatch({ path: to, end: end ?? true })
  const active = !!match
  return (
    <li className={`menu-item${active ? ' active' : ''}`}>
      <NavLink to={to} end={end}>
        {children}
      </NavLink>
    </li>
  )
}

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header id="gen-header" className="gen-header-style-1 gen-has-sticky gen-header-sticky">
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
                      <PrimaryNavItem to="/catalog">Catalog</PrimaryNavItem>
                      <PrimaryNavItem to="/lobby">Lobby</PrimaryNavItem>
                      <PrimaryNavItem to="/room/demo-room">Room (demo)</PrimaryNavItem>
                      <PrimaryNavItem to="/admin" end={false}>
                        Admin
                      </PrimaryNavItem>
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
