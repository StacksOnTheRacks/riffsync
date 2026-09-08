import { NavLink } from 'react-router-dom'
import { useFanSession } from '../../auth/useFanSession'
import { FriendsDropdown } from '../../friends/FriendsDropdown'
import { GlobalSearchCombobox } from './GlobalSearchCombobox'
import { ProfileMenu } from './ProfileMenu'
import { SidebarHamburger } from './SidebarHamburger'

type TopBarProps = {
  sidebarExpanded: boolean
  onToggleSidebar: () => void
}

export function TopBar({ sidebarExpanded, onToggleSidebar }: TopBarProps) {
  const { fanToken } = useFanSession()

  return (
    <header className="riffsync-app-shell-topbar">
      <div className="riffsync-app-shell-topbar-start">
        <SidebarHamburger expanded={sidebarExpanded} onToggle={onToggleSidebar} />
        <NavLink className="riffsync-app-shell-brand" to="/" end>
          RiffSync
        </NavLink>
      </div>
      <div className="riffsync-app-shell-topbar-center">
        <GlobalSearchCombobox />
      </div>
      <div className="riffsync-app-shell-topbar-end">
        {fanToken ? <FriendsDropdown /> : null}
        <ProfileMenu />
      </div>
    </header>
  )
}
