// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import type { CatalogEpisode } from './catalogTypes'
import {
  episodeAllowsInAppEmbed,
  openCatalogYoutubeWatch,
  resolveCatalogYoutubeWatchUrl,
} from './catalogYoutubePlayback'

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

describe('episodeAllowsInAppEmbed', () => {
  it('allows in-app embed unless embedAllows is explicitly false', () => {
    expect(episodeAllowsInAppEmbed(episode())).toBe(true)
    expect(episodeAllowsInAppEmbed(episode({ embedAllows: true }))).toBe(true)
    expect(episodeAllowsInAppEmbed(episode({ embedAllows: false }))).toBe(false)
  })
})

describe('resolveCatalogYoutubeWatchUrl', () => {
  it('prefers and canonicalizes a valid watch URL', () => {
    expect(
      resolveCatalogYoutubeWatchUrl(
        episode({
          youtubeVideoId: 'dQw4w9WgXcQ',
          youtubeWatchUrl: ' https://youtu.be/NXGXtm6gcxk?t=42 ',
        }),
      ),
    ).toBe('https://www.youtube.com/watch?v=NXGXtm6gcxk')
  })

  it('falls back to a canonical watch URL from youtubeVideoId', () => {
    expect(resolveCatalogYoutubeWatchUrl(episode({ youtubeWatchUrl: null }))).toBe(
      'https://www.youtube.com/watch?v=NXGXtm6gcxk',
    )
  })

  it('returns null when neither YouTube field resolves', () => {
    expect(
      resolveCatalogYoutubeWatchUrl(
        episode({
          youtubeVideoId: 'too-short',
          youtubeWatchUrl: 'https://example.test/not-youtube',
        }),
      ),
    ).toBeNull()
  })
})

describe('openCatalogYoutubeWatch', () => {
  it('opens YouTube in a new tab without opener access', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    openCatalogYoutubeWatch('https://www.youtube.com/watch?v=NXGXtm6gcxk')

    expect(open).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=NXGXtm6gcxk',
      '_blank',
      'noopener,noreferrer',
    )
    open.mockRestore()
  })
})
