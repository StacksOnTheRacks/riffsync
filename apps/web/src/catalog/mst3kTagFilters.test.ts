import { describe, expect, it } from 'vitest'
import {
  deriveMst3kTagPillOptions,
  filterCatalogEntriesByTagPills,
  filterMst3kCatalogEntries,
  toggleMst3kTagPill,
} from './mst3kTagFilters'
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
  episode({ id: 'ep-a', experimentNumber: 200, title: 'Pod People', tags: ['Era: Joel', 'Season: 1'] }),
  episode({ id: 'ep-b', experimentNumber: 101, title: 'Cave Dwellers', tags: ['Era: Mike', 'Season: 1'] }),
  episode({ id: 'ep-c', experimentNumber: 310, title: 'Giant Spider', tags: ['Era: Jonah', 'Season: 3'] }),
  episode({ id: 'ep-d', experimentNumber: 501, title: 'Teenage Caveman', tags: ['Era: Joel', 'Season: 5'] }),
]

describe('mst3kTagFilters', () => {
  it('derives distinct Era and Season pill options from entries', () => {
    expect(deriveMst3kTagPillOptions(sampleEntries, 'Era')).toEqual([
      'Era: Joel',
      'Era: Jonah',
      'Era: Mike',
    ])
    expect(deriveMst3kTagPillOptions(sampleEntries, 'Season')).toEqual([
      'Season: 1',
      'Season: 3',
      'Season: 5',
    ])
  })

  it('sorts Season pills numerically', () => {
    const entries = [
      episode({ id: 'ep-10', experimentNumber: 1001, tags: ['Season: 10'] }),
      episode({ id: 'ep-2', experimentNumber: 201, tags: ['Season: 2'] }),
      episode({ id: 'ep-11', experimentNumber: 1101, tags: ['Season: 11'] }),
    ]
    expect(deriveMst3kTagPillOptions(entries, 'Season')).toEqual([
      'Season: 2',
      'Season: 10',
      'Season: 11',
    ])
  })

  it('ORs selected tags within one namespace', () => {
    const result = filterCatalogEntriesByTagPills(sampleEntries, {
      Era: ['Era: Joel'],
      Season: [],
    })
    expect(result.map((entry) => entry.id)).toEqual(['ep-a', 'ep-d'])
  })

  it('ANDs Era and Season namespaces', () => {
    const result = filterCatalogEntriesByTagPills(sampleEntries, {
      Era: ['Era: Joel'],
      Season: ['Season: 1'],
    })
    expect(result.map((entry) => entry.id)).toEqual(['ep-a'])
  })

  it('ORs multiple selected values within Season', () => {
    const result = filterCatalogEntriesByTagPills(sampleEntries, {
      Era: [],
      Season: ['Season: 1', 'Season: 3'],
    })
    expect(result.map((entry) => entry.id)).toEqual(['ep-a', 'ep-b', 'ep-c'])
  })

  it('combines title search and tag pills with AND semantics', () => {
    const result = filterMst3kCatalogEntries(sampleEntries, {
      titleQuery: 'cave',
      catalogs: ['mst3k'],
      selectedTagPills: {
        Era: ['Era: Mike'],
        Season: [],
      },
    })
    expect(result.map((entry) => entry.id)).toEqual(['ep-b'])
  })

  it('retains experiment-number sort order after filtering', () => {
    const result = filterMst3kCatalogEntries(sampleEntries, {
      titleQuery: '',
      catalogs: ['mst3k'],
      selectedTagPills: {
        Era: ['Era: Joel'],
        Season: ['Season: 1'],
      },
    })
    expect(result.map((entry) => entry.experimentNumber)).toEqual([200])
  })

  it('toggles tag pill selection within a namespace', () => {
    expect(
      toggleMst3kTagPill({ Era: [], Season: [] }, 'Era: Joel'),
    ).toEqual({ Era: ['Era: Joel'], Season: [] })
    expect(
      toggleMst3kTagPill({ Era: ['Era: Joel'], Season: [] }, 'Era: Joel'),
    ).toEqual({ Era: [], Season: [] })
  })
})
