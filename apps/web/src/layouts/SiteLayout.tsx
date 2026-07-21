import { Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { SiteHeader } from '../components/site/SiteHeader'
import { SiteFooter } from '../components/site/SiteFooter'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import { useVisualViewportRoomShell } from '../room/useVisualViewportRoomShell'

function SiteLayoutShell() {
  const roomMatch = useMatch({ path: '/room/:roomId/*', end: false })
  const roomShell = Boolean(roomMatch)
  const viewportShell = useVisualViewportRoomShell(roomShell)

  return (
    <div
      className={`riffsync-site${roomShell ? ` riffsync-site--room${viewportShell.className}` : ''}`}
      style={roomShell ? viewportShell.style : undefined}
    >
      {!roomMatch ? <SiteHeader /> : null}
      <main
        id="riffsync-main"
        className={`riffsync-main${roomShell ? ' riffsync-main--room' : ''}`}
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
