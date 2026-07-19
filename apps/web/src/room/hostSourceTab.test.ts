import { describe, expect, it } from 'vitest'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { hostSourceOpensOnYoutube, resolveHostSourceTabUrl } from './hostSourceTab'

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
    ...overrides,
  }
}

describe('resolveHostSourceTabUrl', () => {
  it('opens YouTube directly for the current non-embeddable catalog episode', () => {
    const args = {
      catalogEp: episode({ embedAllows: false }),
      catalogEpisodeId: '032-mitchell',
      origin: 'https://riffsync.tv',
    }

    expect(resolveHostSourceTabUrl(args)).toBe('https://www.youtube.com/watch?v=NXGXtm6gcxk')
    expect(hostSourceOpensOnYoutube(args)).toBe(true)
  })

  it('keeps the party-capture tab for embeddable episodes', () => {
    const args = {
      catalogEp: episode({ embedAllows: true }),
      catalogEpisodeId: '032-mitchell',
      origin: 'https://riffsync.tv/',
    }

    expect(resolveHostSourceTabUrl(args)).toBe('https://riffsync.tv/watch/032-mitchell?partyCapture=1')
    expect(hostSourceOpensOnYoutube(args)).toBe(false)
  })

  it('keeps the party-capture tab when the loaded catalog row is stale or missing', () => {
    expect(
      resolveHostSourceTabUrl({
        catalogEp: episode({ id: 'not-current', embedAllows: false }),
        catalogEpisodeId: '032-mitchell',
        origin: 'https://riffsync.tv',
      }),
    ).toBe('https://riffsync.tv/watch/032-mitchell?partyCapture=1')

    expect(
      resolveHostSourceTabUrl({
        catalogEp: undefined,
        catalogEpisodeId: 'movie with spaces',
        origin: 'https://riffsync.tv',
      }),
    ).toBe('https://riffsync.tv/watch/movie%20with%20spaces?partyCapture=1')
  })
})
