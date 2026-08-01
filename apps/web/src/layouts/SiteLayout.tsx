import { Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { SiteHeader } from '../components/site/SiteHeader'
import { SiteFooter } from '../components/site/SiteFooter'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import { useVisualViewportRoomShell } from '../room/useVisualViewportRoomShell'

function SiteLayoutShell() {
  const roomMatch = useMatch({ path: '/room/:roomId/*', end: false })
  const liveMatch = useMatch({ path: '/live/:slug', end: true })
  const roomShell = Boolean(roomMatch)
  const liveShell = Boolean(liveMatch)
  const partyShell = roomShell || liveShell
  const viewportShell = useVisualViewportRoomShell(partyShell)

  return (
    <div
      className={`riffsync-site${
        partyShell
          ? ` riffsync-site--room${liveShell ? ' riffsync-site--live' : ''}${viewportShell.className}`
          : ''
      }`}
      style={partyShell ? viewportShell.style : undefined}
    >
      {roomShell ? null : <SiteHeader compact={liveShell} />}
      <main
        id="riffsync-main"
        className={`riffsync-main${partyShell ? ' riffsync-main--room' : ''}${
          liveShell ? ' riffsync-main--live' : ''
        }`}
      >
        <Outlet />
      </main>
      {partyShell ? null : <SiteFooter compact={false} />}
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
