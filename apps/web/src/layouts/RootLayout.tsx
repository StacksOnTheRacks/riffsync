import { NavLink, Outlet } from 'react-router-dom'
import './RootLayout.css'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'app-nav__link app-nav__link--active' : 'app-nav__link'

export function RootLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/" className="app-brand" end>
          RiffSync
        </NavLink>
        <nav className="app-nav" aria-label="Primary">
          <NavLink to="/" className={navLinkClass} end>
            Home
          </NavLink>
          <NavLink to="/catalog" className={navLinkClass}>
            Catalog
          </NavLink>
          <NavLink to="/lobby" className={navLinkClass}>
            Lobby
          </NavLink>
          <NavLink to="/room/demo-room" className={navLinkClass}>
            Room (demo)
          </NavLink>
          <NavLink to="/admin" className={navLinkClass}>
            Admin
          </NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
