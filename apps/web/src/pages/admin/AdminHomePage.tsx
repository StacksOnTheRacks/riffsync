import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { StaffSessionKeepAlive } from '../../auth/StaffSessionKeepAlive'
import { refreshStaffTokensIfStale } from '../../auth/staffHostedUiPkce'
import { clearStaffTokens, getStaffAccessToken } from '../../auth/staffTokens'
import {
  fetchStaffSession,
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
  type StaffSessionPayload,
} from '../../api/staffAdminSessionApi'

export function StaffAdminGate() {
  const location = useLocation()
  const token = getStaffAccessToken()

  if (!token) {
    const returnTo = `${location.pathname}${location.search}`
    return (
      <Navigate
        to={`/admin/login?returnTo=${encodeURIComponent(returnTo)}`}
        replace
        state={{ from: location }}
      />
    )
  }

  return (
    <>
      <StaffSessionKeepAlive />
      <Outlet />
    </>
  )
}

export function AdminHomePage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<StaffSessionPayload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setErr(null)
      try {
        await refreshStaffTokensIfStale()
        const token = getStaffAccessToken()
        if (!token) {
          if (!cancelled) navigate('/admin/login', { replace: true })
          return
        }
        const payload = await fetchStaffSession(token)
        if (!cancelled) setSession(payload)
      } catch (e: unknown) {
        if (cancelled) return
        if (e instanceof StaffSessionUnauthorizedError || e instanceof StaffSessionForbiddenError) {
          setErr(e.message)
        } else {
          setErr(e instanceof Error ? e.message : 'Could not load operator session')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const onSignOut = () => {
    clearStaffTokens()
    navigate('/admin/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="container">
        <p>Loading operator session…</p>
      </div>
    )
  }

  return (
    <div className="container">
      <h1>Admin</h1>
      {err ? (
        <div role="alert" className="riffsync-scaffold-note">
          <p>{err}</p>
          <p>
            <a href="/admin/login">Try operator sign-in again</a>
          </p>
        </div>
      ) : session ? (
        <>
          <p>Signed in as operator.</p>
          <dl className="riffsync-admin-session">
            <dt>Email</dt>
            <dd>{session.email ?? session.sub}</dd>
            <dt>Subject</dt>
            <dd>
              <code>{session.sub}</code>
            </dd>
            <dt>Groups</dt>
            <dd>{session.groups.length > 0 ? session.groups.join(', ') : '(none)'}</dd>
          </dl>
        </>
      ) : null}
      <p>
        <button type="button" className="btn btn-secondary" onClick={onSignOut}>
          Sign out
        </button>
      </p>
    </div>
  )
}
