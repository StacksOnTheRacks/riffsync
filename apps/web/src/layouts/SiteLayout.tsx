import { Outlet } from 'react-router-dom'
import { SiteHeader } from '../components/site/SiteHeader'
import { SiteFooter } from '../components/site/SiteFooter'

export function SiteLayout() {
  return (
    <div className="riffsync-site">
      <SiteHeader />
      <main id="riffsync-main" className="riffsync-main">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
