import { Outlet, useMatch } from 'react-router-dom'
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
      {roomShell ? null : <SiteHeader compact={false} />}
      <main id="riffsync-main" className={`riffsync-main${roomShell ? ' riffsync-main--room' : ''}`}>
        <Outlet />
      </main>
      {roomShell ? null : <SiteFooter compact={false} />}
    </div>
  )
}

export function SiteLayout() {
  return (
    <RoomChromeProvider>
      <SiteLayoutShell />
    </RoomChromeProvider>
  )
}
