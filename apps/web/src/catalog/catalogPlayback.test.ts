import { describe, expect, it } from 'vitest'
import type { CatalogEpisode } from './catalogTypes'
import {
  catalogEntriesPlayableInApp,
  catalogEntriesVisibleInPublicBrowse,
  episodeIsPlayableInApp,
  readCatalogPlaybackHost,
} from './catalogPlayback'

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

describe('episodeIsPlayableInApp', () => {
  it('treats Custom-host rows with HTTPS customPlaybackUrl as playable', () => {
    expect(
      episodeIsPlayableInApp(
        episode({
          playbackHost: 'custom',
          customPlaybackUrl: 'https://example.com/movie',
          youtubeVideoId: null,
        }),
      ),
    ).toBe(true)
  })

  it('rejects Custom-host rows with missing or non-HTTPS customPlaybackUrl', () => {
    expect(
      episodeIsPlayableInApp(
        episode({
          playbackHost: 'custom',
          customPlaybackUrl: null,
          youtubeVideoId: 'abc12345678',
        }),
      ),
    ).toBe(false)
    expect(
      episodeIsPlayableInApp(
        episode({
          playbackHost: 'custom',
          customPlaybackUrl: 'http://example.com/movie',
        }),
      ),
    ).toBe(false)
    expect(
      episodeIsPlayableInApp(
        episode({
          playbackHost: 'custom',
          customPlaybackUrl: '   ',
        }),
      ),
    ).toBe(false)
  })

  it('treats YouTube-host rows with a non-empty video id as playable', () => {
    expect(episodeIsPlayableInApp(episode({ youtubeVideoId: 'abc12345678' }))).toBe(true)
    expect(
      episodeIsPlayableInApp(
        episode({ youtubeVideoId: 'abc12345678', embedAllows: false }),
      ),
    ).toBe(true)
  })

  it('rejects YouTube-host rows without a video id', () => {
    expect(episodeIsPlayableInApp(episode({ youtubeVideoId: null }))).toBe(false)
    expect(episodeIsPlayableInApp(episode({ youtubeVideoId: '   ' }))).toBe(false)
  })

  it('defaults legacy rows missing playbackHost to youtube host rules', () => {
    expect(
      episodeIsPlayableInApp(
        episode({
          playbackHost: undefined as unknown as 'youtube',
          youtubeVideoId: 'abc12345678',
        }),
      ),
    ).toBe(true)
  })
})

describe('catalogEntriesPlayableInApp', () => {
  it('returns only playable rows', () => {
    const entries = [
      episode({ id: 'yt', youtubeVideoId: 'abc12345678' }),
      episode({ id: 'custom', playbackHost: 'custom', customPlaybackUrl: 'https://x.test/m', youtubeVideoId: null }),
      episode({ id: 'missing', youtubeVideoId: null }),
      episode({ id: 'bad-custom', playbackHost: 'custom', customPlaybackUrl: null }),
    ]
    expect(catalogEntriesPlayableInApp(entries).map((e) => e.id)).toEqual(['yt', 'custom'])
  })
})

describe('catalogEntriesVisibleInPublicBrowse', () => {
  it('excludes playable movie_night rows from public browse', () => {
    const entries = [
      episode({ id: 'yt', youtubeVideoId: 'abc12345678' }),
      episode({ id: 'movie', catalog: 'movie_night', youtubeVideoId: 'abc12345678' }),
      episode({ id: 'other', catalog: 'other', youtubeVideoId: 'abc12345678' }),
    ]
    expect(catalogEntriesVisibleInPublicBrowse(entries).map((e) => e.id)).toEqual(['yt'])
  })
})
