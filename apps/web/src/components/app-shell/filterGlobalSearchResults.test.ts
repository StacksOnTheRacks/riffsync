import { describe, expect, it } from 'vitest'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { filterGlobalSearchCatalogTitles } from './filterGlobalSearchResults'

function episode(overrides: Partial<CatalogEpisode> = {}): CatalogEpisode {
  return {
    id: '032-mitchell',
    experimentNumber: 32,
    title: 'Mitchell',
    catalog: 'mst3k',
    tags: [],
    labels: [],
    youtubeVideoId: 'NXGXtm6gcxk',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=NXGXtm6gcxk',
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    ...overrides,
  }
}

describe('filterGlobalSearchCatalogTitles', () => {
  const fixtures = [
    episode({ id: 'playable-mst3k', title: 'Mitchell' }),
    episode({ id: 'playable-rifftrax', title: 'Future Force', catalog: 'rifftrax' }),
    episode({ id: 'staff-other', title: 'Staff Secret', catalog: 'other' }),
    episode({ id: 'live-row', title: 'Live Stream', catalog: 'live', youtubeVideoId: 'live123' }),
    episode({
      id: 'movie-night-row',
      title: 'Movie Night Title',
      catalog: 'movie_night',
    }),
    episode({
      id: 'unplayable-row',
      title: 'Missing Video',
      youtubeVideoId: '',
      youtubeWatchUrl: null,
    }),
  ]

  it('filters through public browse then case-insensitive title substring', () => {
    const results = filterGlobalSearchCatalogTitles(fixtures, 'mit')
    expect(results.map((row) => row.id)).toEqual(['playable-mst3k'])
  })

  it('excludes staff-only, live, movie_night, and non-playable rows', () => {
    expect(filterGlobalSearchCatalogTitles(fixtures, 'staff').map((row) => row.id)).toEqual([])
    expect(filterGlobalSearchCatalogTitles(fixtures, 'live').map((row) => row.id)).toEqual([])
    expect(filterGlobalSearchCatalogTitles(fixtures, 'movie night').map((row) => row.id)).toEqual([])
    expect(filterGlobalSearchCatalogTitles(fixtures, 'missing').map((row) => row.id)).toEqual([])
  })

  it('caps results at eight titles', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      episode({ id: `row-${index}`, title: `Alpha Episode ${index}` }),
    )
    expect(filterGlobalSearchCatalogTitles(many, 'alpha')).toHaveLength(8)
  })

  it('returns empty for blank query', () => {
    expect(filterGlobalSearchCatalogTitles(fixtures, '   ')).toEqual([])
  })
})
