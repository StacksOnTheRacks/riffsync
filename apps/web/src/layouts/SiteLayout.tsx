import { Outlet, useMatch } from 'react-router-dom'
import { SiteHeader } from '../components/site/SiteHeader'
import { SiteFooter } from '../components/site/SiteFooter'

export function SiteLayout() {
  const roomMatch = useMatch({ path: '/room/:roomId', end: true })
  const compactChrome = Boolean(roomMatch)

  return (
    <div className={`riffsync-site${compactChrome ? ' riffsync-site--room' : ''}`}>
      <SiteHeader compact={compactChrome} />
      <main id="riffsync-main" className={`riffsync-main${compactChrome ? ' riffsync-main--room' : ''}`}>
        <Outlet />
      </main>
      <SiteFooter compact={compactChrome} />
    </div>
  )
}
