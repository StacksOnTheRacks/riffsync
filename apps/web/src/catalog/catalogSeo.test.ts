import { describe, expect, it } from 'vitest'
import type { CatalogEpisode } from './catalogTypes'
import {
  catalogEntriesIndexableForSeo,
  episodeIsIndexableForSeo,
  readCatalogPlaybackHost,
} from './catalogSeo'

function episode(overrides: Partial<CatalogEpisode> = {}): CatalogEpisode {
  return {
    id: 'ep-1',
    experimentNumber: 1,
    title: 'Test',
    catalog: 'mst3k',
    tags: [],
    labels: [],
    youtubeVideoId: 'abc12345678',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=abc12345678',
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

describe('readCatalogPlaybackHost', () => {
  it('defaults missing or invalid playbackHost to youtube', () => {
    expect(readCatalogPlaybackHost(episode({ playbackHost: 'youtube' }))).toBe('youtube')
    expect(readCatalogPlaybackHost(episode({ playbackHost: 'custom' }))).toBe('custom')
    expect(readCatalogPlaybackHost(episode({ playbackHost: 'invalid' as 'youtube' }))).toBe('youtube')
  })
})

describe('episodeIsIndexableForSeo', () => {
  it('excludes Custom-host rows even when youtubeVideoId is present', () => {
    expect(
      episodeIsIndexableForSeo(
        episode({
          playbackHost: 'custom',
          customPlaybackUrl: 'https://example.com/movie',
          youtubeVideoId: 'abc12345678',
        }),
      ),
    ).toBe(false)
  })

  it('includes YouTube-host rows with a non-empty video id', () => {
    expect(episodeIsIndexableForSeo(episode({ youtubeVideoId: 'abc12345678' }))).toBe(true)
    expect(
      episodeIsIndexableForSeo(
        episode({ youtubeVideoId: 'abc12345678', embedAllows: false }),
      ),
    ).toBe(true)
  })

  it('excludes YouTube-host rows without a video id', () => {
    expect(episodeIsIndexableForSeo(episode({ youtubeVideoId: null }))).toBe(false)
    expect(episodeIsIndexableForSeo(episode({ youtubeVideoId: '   ' }))).toBe(false)
  })

  it('excludes movie_night rows withheld from public browse', () => {
    expect(
      episodeIsIndexableForSeo(
        episode({ catalog: 'movie_night', youtubeVideoId: 'abc12345678' }),
      ),
    ).toBe(false)
  })
})

describe('catalogEntriesIndexableForSeo', () => {
  it('returns only SEO-indexable rows', () => {
    const entries = [
      episode({ id: 'yt', youtubeVideoId: 'abc12345678' }),
      episode({
        id: 'custom-only',
        playbackHost: 'custom',
        customPlaybackUrl: 'https://x.test/m',
        youtubeVideoId: null,
      }),
      episode({
        id: 'custom-with-yt',
        playbackHost: 'custom',
        customPlaybackUrl: 'https://x.test/m',
        youtubeVideoId: 'abc12345678',
      }),
      episode({ id: 'missing', youtubeVideoId: null }),
    ]
    expect(catalogEntriesIndexableForSeo(entries).map((e) => e.id)).toEqual(['yt'])
  })
})
