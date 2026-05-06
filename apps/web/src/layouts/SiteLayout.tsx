import { Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { SiteHeader } from '../components/site/SiteHeader'
import { SiteFooter } from '../components/site/SiteFooter'

export function SiteLayout() {
  const roomMatch = useMatch({ path: '/room/:roomId', end: true })
  const watchMatch = useMatch({ path: '/watch/:catalogEpisodeId', end: true })
  const [searchParams] = useSearchParams()
  const partyCaptureBare = Boolean(watchMatch && searchParams.get('partyCapture') === '1')

  const compactChrome = Boolean(roomMatch)

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
    <div className={`riffsync-site${compactChrome ? ' riffsync-site--room' : ''}`}>
      <SiteHeader compact={compactChrome} />
      <main id="riffsync-main" className={`riffsync-main${compactChrome ? ' riffsync-main--room' : ''}`}>
        <Outlet />
      </main>
      {!roomMatch ? <SiteFooter compact={false} /> : null}
    </div>
  )
}
