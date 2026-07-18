import { describe, expect, it } from 'vitest'
import { filterStaffCatalogEntries } from './filterStaffCatalogEntries'
import type { StaffCatalogEpisode } from './staffCatalogTypes'

function episode(overrides: Partial<StaffCatalogEpisode> & Pick<StaffCatalogEpisode, 'id'>): StaffCatalogEpisode {
  return {
    experimentNumber: 100,
    title: 'Default',
    catalog: 'mst3k',
    tags: [],
    labels: [],
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
    youtubeThumbnailUrl: null,
    ...overrides,
  }
}

const sampleEntries: StaffCatalogEpisode[] = [
  episode({ id: 'ep-a', experimentNumber: 200, title: 'Pod People', tags: ['Era: Joel'] }),
  episode({ id: 'ep-b', experimentNumber: 101, title: 'Cave Dwellers', tags: ['Era: Mike'] }),
  episode({
    id: 'special-ep',
    experimentNumber: 310,
    title: 'Giant Spider',
    tags: ['Era: Jonah'],
    labels: ['Spider'],
  }),
]

describe('filterStaffCatalogEntries', () => {
  it('returns all entries sorted by experimentNumber when filters are empty', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: '', catalog: 'all' })
    expect(result.map((e) => e.id)).toEqual(['ep-b', 'ep-a', 'special-ep'])
  })

  it('filters by case-insensitive id substring', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: 'SPECIAL', catalog: 'all' })
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('special-ep')
  })

  it('filters by title substring', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: 'cave', catalog: 'all' })
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('Cave Dwellers')
  })

  it('filters by experiment number substring', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: '101', catalog: 'all' })
    expect(result.map((e) => e.id)).toEqual(['ep-b'])
  })

  it('filters by catalog when not All', () => {
    const result = filterStaffCatalogEntries(
      [...sampleEntries, episode({ id: 'community', catalog: 'community' })],
      { query: '', catalog: 'community' },
    )
    expect(result.map((e) => e.id)).toEqual(['community'])
  })

  it('combines query and catalog filters', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: 'pod', catalog: 'mst3k' })
    expect(result.map((e) => e.id)).toEqual(['ep-a'])
  })

  it('matches tags and labels', () => {
    expect(filterStaffCatalogEntries(sampleEntries, { query: 'era: mike', catalog: 'all' }).map((e) => e.id)).toEqual(['ep-b'])
    expect(filterStaffCatalogEntries(sampleEntries, { query: 'spider', catalog: 'all' }).map((e) => e.id)).toEqual(['special-ep'])
  })

  it('returns empty when query matches no rows', () => {
    const result = filterStaffCatalogEntries(sampleEntries, { query: 'zzzz-no-match', catalog: 'all' })
    expect(result).toHaveLength(0)
  })

  it('re-sorts filtered rows by experimentNumber ascending', () => {
    const shuffled = [sampleEntries[2]!, sampleEntries[0]!, sampleEntries[1]!]
    const result = filterStaffCatalogEntries(shuffled, { query: '', catalog: 'all' })
    expect(result.map((e) => e.experimentNumber)).toEqual([101, 200, 310])
  })
})
