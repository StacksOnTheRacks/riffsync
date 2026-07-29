import { describe, expect, it } from 'vitest'
import { PUBLIC_CATALOG_CATEGORIES } from './catalogTypes'
import { DEFAULT_CATALOG_FILTER_CATEGORIES, filterCatalogEntries } from './filterCatalogEntries'
import type { CatalogEpisode } from './catalogTypes'

function episode(overrides: Partial<CatalogEpisode> & Pick<CatalogEpisode, 'id'>): CatalogEpisode {
  return {
    experimentNumber: 100,
    title: 'Default',
    catalog: 'mst3k',
    tags: [],
    labels: [],
    youtubeVideoId: 'abc123',
    youtubeWatchUrl: 'https://youtube.com/watch?v=abc123',
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

const sampleEntries: CatalogEpisode[] = [
  episode({ id: 'ep-a', experimentNumber: 200, title: 'Pod People', tags: ['Era: Joel'] }),
  episode({ id: 'ep-b', experimentNumber: 101, title: 'Cave Dwellers', tags: ['Era: Mike'] }),
  episode({ id: 'ep-c', experimentNumber: 310, title: 'Giant Spider', tags: ['Era: Jonah'] }),
  episode({ id: 'ep-d', experimentNumber: 1200, title: 'Emily Special', tags: ['Era: Emily'] }),
  episode({ id: 'ep-e', experimentNumber: 999, title: 'Other Experiment', catalog: 'other' }),
  episode({ id: 'ep-f', experimentNumber: 500, title: 'Community Riff', catalog: 'community' }),
  episode({ id: 'ep-g', experimentNumber: 1500, title: 'Movie Night Pick', catalog: 'movie_night' }),
  episode({
    id: 'ep-h',
    experimentNumber: 1600,
    title: 'Riff Material Classic',
    catalog: 'riff_material',
    labels: ['Riff Material'],
  }),
]

describe('filterCatalogEntries', () => {
  it('returns all entries sorted by experimentNumber when filters are empty', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: '', catalogs: [] })
    expect(result.map((e) => e.id)).toEqual(['ep-b', 'ep-a', 'ep-c', 'ep-f', 'ep-e', 'ep-d', 'ep-g', 'ep-h'])
  })

  it('filters by a single catalog', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: '', catalogs: ['community'] })
    expect(result.map((e) => e.id)).toEqual(['ep-f'])
  })

  it('filters by multiple catalogs with OR semantics', () => {
    const result = filterCatalogEntries(sampleEntries, {
      titleQuery: '',
      catalogs: ['community', 'riff_material'],
    })
    expect(result.map((e) => e.id)).toEqual(['ep-f', 'ep-h'])
  })

  it('filters by case-insensitive title substring', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: 'cave', catalogs: [] })
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('Cave Dwellers')
  })

  it('does not match id or experiment number in title search', () => {
    expect(filterCatalogEntries(sampleEntries, { titleQuery: 'ep-a', catalogs: [] })).toHaveLength(0)
    expect(filterCatalogEntries(sampleEntries, { titleQuery: '101', catalogs: [] })).toHaveLength(0)
  })

  it('matches tags and labels in title search', () => {
    expect(filterCatalogEntries(sampleEntries, { titleQuery: 'era: mike', catalogs: [] }).map((e) => e.id)).toEqual(['ep-b'])
    expect(filterCatalogEntries(sampleEntries, { titleQuery: 'riff material', catalogs: [] }).map((e) => e.id)).toEqual(['ep-h'])
  })

  it('combines catalog and title filters', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: 'pod', catalogs: ['mst3k'] })
    expect(result.map((e) => e.id)).toEqual(['ep-a'])
  })

  it('returns empty when filters match no rows', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: 'zzzz-no-match', catalogs: ['mst3k'] })
    expect(result).toHaveLength(0)
  })

  it('re-sorts filtered rows by experimentNumber ascending', () => {
    const shuffled = [sampleEntries[4]!, sampleEntries[0]!, sampleEntries[1]!]
    const result = filterCatalogEntries(shuffled, { titleQuery: '', catalogs: [] })
    expect(result.map((e) => e.experimentNumber)).toEqual([101, 200, 999])
  })

  it('filters MST3K catalog and excludes community, riff_material, movie_night, and other', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: '', catalogs: ['mst3k'] })
    expect(result.map((e) => e.id)).toEqual(['ep-b', 'ep-a', 'ep-c', 'ep-d'])
    expect(result.map((e) => e.catalog)).not.toContain('community')
    expect(result.map((e) => e.catalog)).not.toContain('riff_material')
    expect(result.map((e) => e.catalog)).not.toContain('movie_night')
    expect(result.map((e) => e.catalog)).not.toContain('other')
  })

  it('filters by default public catalog categories', () => {
    const result = filterCatalogEntries(sampleEntries, {
      titleQuery: '',
      catalogs: DEFAULT_CATALOG_FILTER_CATEGORIES,
    })
    expect(result.map((e) => e.id)).toEqual(['ep-b', 'ep-a', 'ep-c', 'ep-f', 'ep-d', 'ep-g', 'ep-h'])
  })

  it('excludes other from public catalog category chips', () => {
    expect(PUBLIC_CATALOG_CATEGORIES).toContain('riff_material')
    expect(PUBLIC_CATALOG_CATEGORIES).not.toContain('other')
  })
})
