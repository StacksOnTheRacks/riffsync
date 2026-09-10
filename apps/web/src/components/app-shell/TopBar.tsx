import { NavLink } from 'react-router-dom'
import { useFanSession } from '../../auth/useFanSession'
import { useShowGetAppNav } from '../../pwa/useShowGetAppNav'
import { GlobalSearchCombobox } from './GlobalSearchCombobox'
import { ProfileMenu } from './ProfileMenu'
import { SidebarHamburger } from './SidebarHamburger'

const TOPBAR_ICON = {
  logo: '/app-shell/topbar/logo.svg',
  download: '/app-shell/sidebar/download-app.svg',
  help: '/app-shell/topbar/help.svg',
} as const

type TopBarProps = {
  sidebarExpanded: boolean
  onToggleSidebar: () => void
  showSidebarToggle?: boolean
}

export function TopBar({
  sidebarExpanded,
  onToggleSidebar,
  showSidebarToggle = true,
}: TopBarProps) {
  const { fanToken } = useFanSession()
  const showGetAppNav = useShowGetAppNav()
  const signedIn = Boolean(fanToken)

  return (
    <header className="riffsync-app-shell-topbar">
      <div className="riffsync-app-shell-topbar-start">
        {showSidebarToggle ? (
          <SidebarHamburger expanded={sidebarExpanded} onToggle={onToggleSidebar} />
        ) : null}
        <NavLink className="riffsync-app-shell-brand" to="/" end aria-label="RiffSync home">
          <span className="riffsync-app-shell-brand-logo">
            <img src={TOPBAR_ICON.logo} alt="" width={99} height={39} />
          </span>
        </NavLink>
      </div>
      <div className="riffsync-app-shell-topbar-center">
        <GlobalSearchCombobox />
      </div>
      <div className="riffsync-app-shell-topbar-end">
        {signedIn && showGetAppNav ? (
          <NavLink className="riffsync-app-shell-icon-btn" to="/download" aria-label="Download">
            <span className="riffsync-app-shell-topbar-icon">
              <img src={TOPBAR_ICON.download} alt="" width={24} height={24} />
            </span>
          </NavLink>
        ) : null}
        <NavLink
          className="riffsync-app-shell-icon-btn"
          to="/how-to-host-a-watchparty"
          aria-label="How to Host"
        >
          <span className="riffsync-app-shell-topbar-icon">
            <img src={TOPBAR_ICON.help} alt="" width={24} height={24} />
          </span>
        </NavLink>
        <ProfileMenu />
      </div>
    </header>
  )
}
