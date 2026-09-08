import { Outlet } from 'react-router-dom'
import { AppShell } from '../components/app-shell/AppShell'

export function AppShellLayout() {
  return (
    <div className="riffsync-site riffsync-site--app-shell">
      <AppShell>
        <Outlet />
      </AppShell>
    </div>
  )
}
