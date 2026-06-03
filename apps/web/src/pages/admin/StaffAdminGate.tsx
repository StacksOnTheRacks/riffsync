import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AdminSessionProvider } from '../../admin/AdminSessionProvider'
import { StaffSessionKeepAlive } from '../../auth/StaffSessionKeepAlive'
import { getStaffAccessToken } from '../../auth/staffTokens'

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
      <AdminSessionProvider>
        <Outlet />
      </AdminSessionProvider>
    </>
  )
}
