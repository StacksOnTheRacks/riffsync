import { describe, expect, it } from 'vitest'
import type { CatalogEpisode } from './catalogTypes'
import { compareByTmdbPopularity, topEpisodesByTmdbPopularity, topEpisodesForHomeMostPopular } from './mockCatalog'

function ep(
  id: string,
  experimentNumber: number,
  tmdbPopularity?: number | null,
): CatalogEpisode {
  return {
    id,
    experimentNumber,
    title: id,
    catalog: 'mst3k',
    tags: ['Era: Joel'],
    labels: [],
    youtubeVideoId: 'abcdefghijk',
    youtubeWatchUrl: null,
    tagline: null,
    posterImageUrl: null,
    backdropImageUrl: null,
    tmdbMovieId: null,
    tmdbArtworkSyncedAt: null,
    carousel: false,
    spotlight: false,
    tmdbPopularity,
  }
}

describe('compareByTmdbPopularity', () => {
  it('orders by descending popularity', () => {
    const entries = [ep('low', 1, 2), ep('high', 2, 50), ep('mid', 3, 10)]
    const sorted = [...entries].sort(compareByTmdbPopularity)
    expect(sorted.map((e) => e.id)).toEqual(['high', 'mid', 'low'])
  })

  it('breaks popularity ties by experiment number', () => {
    const entries = [ep('b', 20, 5), ep('a', 10, 5)]
    const sorted = [...entries].sort(compareByTmdbPopularity)
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('ranks reconciled rows before missing popularity', () => {
    const entries = [ep('none', 1), ep('ranked', 99, 1)]
    const sorted = [...entries].sort(compareByTmdbPopularity)
    expect(sorted.map((e) => e.id)).toEqual(['ranked', 'none'])
  })
})

describe('topEpisodesByTmdbPopularity', () => {
  it('returns a limited slice with offset', () => {
    const entries = [
      ep('a', 1, 30),
      ep('b', 2, 20),
      ep('c', 3, 10),
      ep('d', 4, 5),
    ]
    expect(topEpisodesByTmdbPopularity(entries, 2).map((e) => e.id)).toEqual(['a', 'b'])
    expect(topEpisodesByTmdbPopularity(entries, 2, 2).map((e) => e.id)).toEqual(['c', 'd'])
  })
})

describe('topEpisodesForHomeMostPopular', () => {
  it('includes only mst3k catalog rows in the home Most Popular row', () => {
    const entries = [
      { ...ep('other-hit', 1, 100), catalog: 'other' as const },
      { ...ep('community-hit', 2, 90), catalog: 'community' as const },
      { ...ep('joel-hit', 3, 50), catalog: 'mst3k' as const },
      { ...ep('mike-hit', 4, 80), catalog: 'mst3k' as const },
    ]
    expect(topEpisodesForHomeMostPopular(entries, 12).map((e) => e.id)).toEqual([
      'mike-hit',
      'joel-hit',
    ])
  })
})
