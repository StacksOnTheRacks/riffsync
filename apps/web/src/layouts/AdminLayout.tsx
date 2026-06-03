import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { abbreviateStaffGroups, useAdminSession } from '../admin/AdminSessionContext'
import { clearStaffTokens } from '../auth/staffTokens'

function adminNavClassName({ isActive }: { isActive: boolean }): string {
  return `riffsync-admin-nav-link${isActive ? ' riffsync-admin-nav-link--active' : ''}`
}

export function AdminLayout() {
  const navigate = useNavigate()
  const { session, loading, error } = useAdminSession()

  const onSignOut = () => {
    clearStaffTokens()
    navigate('/admin/login', { replace: true })
  }

  const identityLabel = session ? (session.email ?? session.sub) : null
  const groupsLabel = session ? abbreviateStaffGroups(session.groups) : null

  return (
    <div className="riffsync-admin-shell">
      <header className="riffsync-admin-header">
        <div className="riffsync-admin-header__brand">
          <span className="riffsync-admin-wordmark">RiffSync Admin</span>
        </div>
        <nav className="riffsync-admin-nav" aria-label="Operator">
          <NavLink to="/admin" end className={adminNavClassName}>
            Home
          </NavLink>
          <NavLink to="/admin/catalog" className={adminNavClassName}>
            Catalog
          </NavLink>
        </nav>
        <div className="riffsync-admin-session-strip" aria-live="polite">
          {loading ? (
            <span className="riffsync-admin-session-strip__meta">Loading session…</span>
          ) : error ? (
            <div role="alert" className="riffsync-admin-session-strip__alert">
              <p>{error}</p>
              <p>
                <a href="/admin/login">Try operator sign-in again</a>
              </p>
            </div>
          ) : session ? (
            <>
              <span className="riffsync-admin-session-strip__identity" title={session.sub}>
                {identityLabel}
              </span>
              <span className="riffsync-admin-session-strip__groups" title={session.groups.join(', ')}>
                {groupsLabel}
              </span>
              <button type="button" className="btn btn-secondary riffsync-admin-sign-out" onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : null}
        </div>
      </header>
      <main className="riffsync-admin-main" id="riffsync-admin-main">
        <Outlet />
      </main>
    </div>
  )
}
