import { Outlet, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/app-shell/AppShell'

export function WatchLayout() {
  const [searchParams] = useSearchParams()
  const partyCaptureBare = searchParams.get('partyCapture') === '1'

  if (partyCaptureBare) {
    return (
      <div className="riffsync-site riffsync-site--party-capture">
        <main id="riffsync-main" className="riffsync-main riffsync-main--party-capture">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="riffsync-site riffsync-site--app-shell">
      <AppShell hideSidebar>
        <Outlet />
      </AppShell>
    </div>
  )
}
