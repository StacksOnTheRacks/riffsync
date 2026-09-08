import { describe, expect, it } from 'vitest'
import { getChannelToolbarTabs, isChannelToolbarTabActive } from './ChannelSectionTabs'

describe('channelToolbarTabs', () => {
  it('returns no tabs on Movies, TV Shows, and Community', () => {
    expect(getChannelToolbarTabs('/catalog/movies')).toEqual([])
    expect(getChannelToolbarTabs('/catalog/tv-shows')).toEqual([])
    expect(getChannelToolbarTabs('/catalog/community')).toEqual([])
    expect(getChannelToolbarTabs('/catalog/riff-material')).toEqual([])
  })

  it('returns Movies | Shorts on MST3K and RiffTrax channel routes', () => {
    expect(getChannelToolbarTabs('/catalog/mst3k/season/3')).toEqual([
      { label: 'Movies', href: '/catalog/mst3k' },
      { label: 'Shorts', href: '/catalog/mst3k/shorts' },
    ])
    expect(getChannelToolbarTabs('/catalog/rifftrax/movies')).toEqual([
      { label: 'Movies', href: '/catalog/rifftrax' },
      { label: 'Shorts', href: '/catalog/rifftrax/shorts' },
    ])
  })

  it('marks MST3K season and era routes as the Movies tab', () => {
    const movies = { label: 'Movies', href: '/catalog/mst3k' }
    const shorts = { label: 'Shorts', href: '/catalog/mst3k/shorts' }
    expect(isChannelToolbarTabActive(movies, '/catalog/mst3k/era/mike')).toBe(true)
    expect(isChannelToolbarTabActive(shorts, '/catalog/mst3k/era/mike')).toBe(false)
    expect(isChannelToolbarTabActive(shorts, '/catalog/mst3k/shorts')).toBe(true)
  })
})
