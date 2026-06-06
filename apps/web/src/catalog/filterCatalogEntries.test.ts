import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG_FILTER_ERAS, filterCatalogEntries } from './filterCatalogEntries'
import type { CatalogEpisode } from './catalogTypes'

function episode(overrides: Partial<CatalogEpisode> & Pick<CatalogEpisode, 'id'>): CatalogEpisode {
  return {
    experimentNumber: 100,
    title: 'Default',
    era: 'joel',
    youtubeVideoId: 'abc123',
    youtubeWatchUrl: 'https://youtube.com/watch?v=abc123',
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    ...overrides,
  }
}

const sampleEntries: CatalogEpisode[] = [
  episode({ id: 'ep-a', experimentNumber: 200, title: 'Pod People', era: 'joel' }),
  episode({ id: 'ep-b', experimentNumber: 101, title: 'Cave Dwellers', era: 'mike' }),
  episode({ id: 'ep-c', experimentNumber: 310, title: 'Giant Spider', era: 'jonah' }),
  episode({ id: 'ep-d', experimentNumber: 1200, title: 'Emily Special', era: 'emily' }),
  episode({ id: 'ep-e', experimentNumber: 999, title: 'Other Experiment', era: 'other' }),
]

describe('filterCatalogEntries', () => {
  it('returns all entries sorted by experimentNumber when filters are empty', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: '', eras: [] })
    expect(result.map((e) => e.id)).toEqual(['ep-b', 'ep-a', 'ep-c', 'ep-e', 'ep-d'])
  })

  it('filters by a single era', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: '', eras: ['mike'] })
    expect(result.map((e) => e.id)).toEqual(['ep-b'])
  })

  it('filters by multiple eras with OR semantics', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: '', eras: ['joel', 'jonah'] })
    expect(result.map((e) => e.id)).toEqual(['ep-a', 'ep-c'])
  })

  it('filters by case-insensitive title substring', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: 'cave', eras: [] })
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('Cave Dwellers')
  })

  it('does not match id or experiment number in title search', () => {
    expect(filterCatalogEntries(sampleEntries, { titleQuery: 'ep-a', eras: [] })).toHaveLength(0)
    expect(filterCatalogEntries(sampleEntries, { titleQuery: '101', eras: [] })).toHaveLength(0)
  })

  it('combines era and title filters', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: 'pod', eras: ['joel'] })
    expect(result.map((e) => e.id)).toEqual(['ep-a'])
  })

  it('returns empty when filters match no rows', () => {
    const result = filterCatalogEntries(sampleEntries, { titleQuery: 'zzzz-no-match', eras: ['mike'] })
    expect(result).toHaveLength(0)
  })

  it('re-sorts filtered rows by experimentNumber ascending', () => {
    const shuffled = [sampleEntries[4]!, sampleEntries[0]!, sampleEntries[1]!]
    const result = filterCatalogEntries(shuffled, { titleQuery: '', eras: [] })
    expect(result.map((e) => e.experimentNumber)).toEqual([101, 200, 999])
  })

  it('filters by default catalog eras (Joel, Mike, Jonah, Emily)', () => {
    const result = filterCatalogEntries(sampleEntries, {
      titleQuery: '',
      eras: DEFAULT_CATALOG_FILTER_ERAS,
    })
    expect(result.map((e) => e.id)).toEqual(['ep-b', 'ep-a', 'ep-c', 'ep-d'])
  })
})
