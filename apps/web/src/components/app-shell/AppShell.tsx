import { useRef, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { useSidebarFocusTrap, useSidebarShellState } from './sidebarShellState'
import { TopBar } from './TopBar'
import { useMobileAppShell } from './useMobileAppShell'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useMobileAppShell()
  const sidebarRef = useRef<HTMLElement>(null)
  const { sidebarExpanded, sidebarCollapsed, toggleSidebar, closeMobileDrawer, drawerOpen } =
    useSidebarShellState(isMobile)

  useSidebarFocusTrap(isMobile && drawerOpen, sidebarRef, closeMobileDrawer)

  return (
    <div
      className={`riffsync-app-shell${isMobile ? ' riffsync-app-shell--mobile' : ' riffsync-app-shell--desktop'}${
        sidebarCollapsed ? ' riffsync-app-shell--collapsed' : ''
      }${drawerOpen ? ' riffsync-app-shell--drawer-open' : ''}`}
    >
      {isMobile && drawerOpen ? (
        <button
          type="button"
          className="riffsync-app-shell-drawer-backdrop"
          aria-label="Close navigation"
          onClick={closeMobileDrawer}
        />
      ) : null}
      <TopBar sidebarExpanded={sidebarExpanded} onToggleSidebar={toggleSidebar} />
      <Sidebar
        ref={sidebarRef}
        id="riffsync-app-shell-sidebar"
        collapsed={sidebarCollapsed}
        mobileOpen={drawerOpen}
        onNavigate={isMobile ? closeMobileDrawer : undefined}
      />
      <main id="riffsync-main" className="riffsync-main riffsync-main--app-shell">
        {children}
      </main>
    </div>
  )
}
