import { LIVE_NOW_WATCH_PARTIES_PATH } from '../../live/liveChannels'

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

  if (pathname === '/live' || pathname === LIVE_NOW_WATCH_PARTIES_PATH) {
    return [
      { label: 'Streams', href: '/live' },
      { label: 'Watch Parties', href: LIVE_NOW_WATCH_PARTIES_PATH },
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
