import { NavLink } from 'react-router-dom'
import {
  isChannelToolbarTabActive,
  type ChannelToolbarTab,
} from './channelToolbarTabs'

export function ChannelSectionTabs({
  tabs,
  pathname,
}: {
  tabs: readonly ChannelToolbarTab[]
  pathname: string
}) {
  if (tabs.length === 0) {
    return null
  }

  return (
    <nav className="riffsync-channel-tabs" aria-label="Channel sections">
      {tabs.map((tab) => {
        const active = isChannelToolbarTabActive(tab, pathname)
        return (
          <NavLink
            key={tab.href}
            to={tab.href}
            className={`riffsync-channel-tabs__tab${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
