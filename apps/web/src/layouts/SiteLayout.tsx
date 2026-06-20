import { Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { SiteHeader } from '../components/site/SiteHeader'
import { SiteFooter } from '../components/site/SiteFooter'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import { useRoomChromeOptional } from '../room/useRoomChrome'
import { useVisualViewportRoomShell } from '../room/useVisualViewportRoomShell'

function SiteLayoutShell() {
  const roomMatch = useMatch({ path: '/room/:roomId', end: true })
  const compactChrome = Boolean(roomMatch)
  const viewportShell = useVisualViewportRoomShell(compactChrome)
  const roomChrome = useRoomChromeOptional()
  const expandedViewActive = Boolean(roomChrome?.expandedViewActive)

  return (
    <div
      className={`riffsync-site${compactChrome ? ` riffsync-site--room${viewportShell.className}` : ''}${expandedViewActive ? ' riffsync-site--room-expanded' : ''}`}
      style={compactChrome ? viewportShell.style : undefined}
    >
      {expandedViewActive ? null : <SiteHeader compact={compactChrome} />}
      <main
        id="riffsync-main"
        className={`riffsync-main${compactChrome ? ' riffsync-main--room' : ''}${expandedViewActive ? ' riffsync-main--room-expanded' : ''}`}
      >
        <Outlet />
      </main>
      {!roomMatch ? <SiteFooter compact={false} /> : null}
    </div>
  )
}

export function SiteLayout() {
  const watchMatch = useMatch({ path: '/watch/:catalogEpisodeId', end: true })
  const [searchParams] = useSearchParams()
  const partyCaptureBare = Boolean(watchMatch && searchParams.get('partyCapture') === '1')

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
    <RoomChromeProvider>
      <SiteLayoutShell />
    </RoomChromeProvider>
  )
}
