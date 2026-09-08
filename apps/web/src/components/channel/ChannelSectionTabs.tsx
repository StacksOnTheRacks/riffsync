import { NavLink } from 'react-router-dom'

export type ChannelToolbarTab = {
  label: string
  href: string
}

export function getChannelToolbarTabs(pathname: string): ChannelToolbarTab[] {
  if (pathname.startsWith('/catalog/mst3k')) {
    return [
      { label: 'Movies', href: '/catalog/mst3k' },
      { label: 'Shorts', href: '/catalog/mst3k/shorts' },
    ]
  }

  if (pathname.startsWith('/catalog/rifftrax')) {
    return [
      { label: 'Movies', href: '/catalog/rifftrax' },
      { label: 'Shorts', href: '/catalog/rifftrax/shorts' },
    ]
  }

  return []
}

export function isChannelToolbarTabActive(tab: ChannelToolbarTab, pathname: string): boolean {
  if (tab.href === '/catalog/mst3k') {
    return (
      pathname === '/catalog/mst3k' ||
      pathname.startsWith('/catalog/mst3k/season/') ||
      pathname.startsWith('/catalog/mst3k/era/')
    )
  }

  if (tab.href === '/catalog/rifftrax') {
    return pathname === '/catalog/rifftrax' || pathname === '/catalog/rifftrax/movies'
  }

  return pathname === tab.href
}

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
