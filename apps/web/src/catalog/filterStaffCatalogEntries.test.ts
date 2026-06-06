import { describe, expect, it } from 'vitest'
import { filterStaffCatalogEntries } from './filterStaffCatalogEntries'
import type { StaffCatalogEpisode } from './staffCatalogTypes'

function episode(overrides: Partial<StaffCatalogEpisode> & Pick<StaffCatalogEpisode, 'id'>): StaffCatalogEpisode {
  return {
    experimentNumber: 100,
    title: 'Default',
    era: 'joel',
    youtubeVideoId: null,
    youtubeWatchUrl: null,
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    movieSearchTitle: null,
    embedAllows: true,
    curatorNotes: null,
    youtubeThumbnailUrl: null,
    ...overrides,
  }
}

const sampleEntries: StaffCatalogEpisode[] = [
  episode({ id: 'ep-a', experimentNumber: 200, title: 'Pod People', era: 'joel' }),
  episode({ id: 'ep-b', experimentNumber: 101, title: 'Cave Dwellers', era: 'mike' }),
  episode({ id: 'special-ep', experimentNumber: 310, title: 'Giant Spider', era: 'jonah' }),
]

describe('filterStaffCatalogEntries', () => {
  it('returns all entries sorted by experimentNumber when filters are empty', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: '', era: 'all' })
    expect(result.map((e) => e.id)).toEqual(['ep-b', 'ep-a', 'special-ep'])
  })

  it('filters by case-insensitive id substring', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: 'SPECIAL', era: 'all' })
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('special-ep')
  })

  it('filters by title substring', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: 'cave', era: 'all' })
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('Cave Dwellers')
  })

  it('filters by experiment number substring', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: '101', era: 'all' })
    expect(result.map((e) => e.id)).toEqual(['ep-b'])
  })

  it('filters by era when not All', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: '', era: 'mike' })
    expect(result.map((e) => e.id)).toEqual(['ep-b'])
  })

  it('combines query and era filters', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: 'ep', era: 'joel' })
    expect(result.map((e) => e.id)).toEqual(['ep-a'])
  })

  it('returns empty when query matches no rows', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: 'zzzz-no-match', era: 'all' })
    expect(result).toHaveLength(0)
  })

  it('re-sorts filtered rows by experimentNumber ascending', () => {
    const shuffled = [sampleEntries[2]!, sampleEntries[0]!, sampleEntries[1]!]
    const result = filterStaffCatalogEntries(shuffled, { query: '', era: 'all' })
    expect(result.map((e) => e.experimentNumber)).toEqual([101, 200, 310])
  })
})
