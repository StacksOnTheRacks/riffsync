import { useRef, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { useSidebarFocusTrap, useSidebarShellState } from './sidebarShellState'
import { TopBar } from './TopBar'
import { useMobileAppShell } from './useMobileAppShell'

type AppShellProps = {
  children: ReactNode
  hideSidebar?: boolean
}

export function AppShell({ children, hideSidebar = false }: AppShellProps) {
  const isMobile = useMobileAppShell()
  const sidebarRef = useRef<HTMLElement>(null)
  const { sidebarExpanded, sidebarCollapsed, toggleSidebar, closeMobileDrawer, drawerOpen } =
    useSidebarShellState(isMobile)

  useSidebarFocusTrap(!hideSidebar && isMobile && drawerOpen, sidebarRef, closeMobileDrawer)

  const className = [
    'riffsync-app-shell',
    hideSidebar ? 'riffsync-app-shell--no-sidebar' : isMobile ? 'riffsync-app-shell--mobile' : 'riffsync-app-shell--desktop',
    !hideSidebar && sidebarCollapsed ? 'riffsync-app-shell--collapsed' : '',
    !hideSidebar && drawerOpen ? 'riffsync-app-shell--drawer-open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      {!hideSidebar && isMobile && drawerOpen ? (
        <button
          type="button"
          className="riffsync-app-shell-drawer-backdrop"
          aria-label="Close navigation"
          onClick={closeMobileDrawer}
        />
      ) : null}
      <TopBar
        sidebarExpanded={sidebarExpanded}
        onToggleSidebar={toggleSidebar}
        showSidebarToggle={!hideSidebar}
      />
      {hideSidebar ? null : (
        <Sidebar
          ref={sidebarRef}
          id="riffsync-app-shell-sidebar"
          collapsed={sidebarCollapsed}
          mobileOpen={drawerOpen}
          onNavigate={isMobile ? closeMobileDrawer : undefined}
        />
      )}
      <main id="riffsync-main" className="riffsync-main riffsync-main--app-shell">
        {children}
      </main>
    </div>
  )
}
