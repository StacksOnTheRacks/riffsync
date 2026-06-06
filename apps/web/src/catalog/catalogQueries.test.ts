import { QueryClient, type QueryFunctionContext } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogEpisode } from './catalogTypes'
import {
  catalogListCarouselQueryKey,
  clearStoredCatalogEtags,
  runCatalogListQuery,
} from './catalogQueries'
import type { CatalogFetchResult } from './catalogApi'

const episode: CatalogEpisode = {
  id: 'ep-1',
  experimentNumber: 1,
  title: 'T',
  era: 'joel',
  youtubeVideoId: null,
  youtubeWatchUrl: null,
  tagline: null,
  posterImageUrl: null,
  backdropImageUrl: null,
  tmdbMovieId: null,
  tmdbArtworkSyncedAt: null,
  carousel: true,
}

function listCtx(client: QueryClient): QueryFunctionContext<typeof catalogListCarouselQueryKey> {
  return {
    client,
    queryKey: catalogListCarouselQueryKey,
    meta: undefined,
    signal: new AbortController().signal,
    pageParam: undefined,
    direction: undefined,
  }
}

describe('runCatalogListQuery', () => {
  beforeEach(() => {
    clearStoredCatalogEtags()
  })

  it('retries without If-None-Match when conditional fetch fails after an etag was stored', async () => {
    const fetcher = vi
      .fn<(etag?: string) => Promise<CatalogFetchResult<CatalogEpisode[]>>>()
      .mockResolvedValueOnce({ kind: 'ok', etag: 'W/"1-carousel"', data: [episode] })

    const client = new QueryClient()
    await runCatalogListQuery(listCtx(client), fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[0]).toBeUndefined()

    fetcher
      .mockRejectedValueOnce(new Error('CORS preflight blocked'))
      .mockResolvedValueOnce({ kind: 'ok', etag: 'W/"2-carousel"', data: [episode] })

    const data = await runCatalogListQuery(listCtx(client), fetcher)

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls[1]?.[0]).toBe('W/"1-carousel"')
    expect(fetcher.mock.calls[2]?.[0]).toBeUndefined()
    expect(data).toEqual([episode])
  })

  it('returns React Query cache when conditional fetch fails and unconditional retry is not needed', async () => {
    const fetcher = vi
      .fn<(etag?: string) => Promise<CatalogFetchResult<CatalogEpisode[]>>>()
      .mockResolvedValueOnce({ kind: 'ok', etag: 'W/"1-carousel"', data: [episode] })

    const client = new QueryClient()
    await client.setQueryData(catalogListCarouselQueryKey, [episode])
    await runCatalogListQuery(listCtx(client), fetcher)

    fetcher.mockRejectedValueOnce(new Error('CORS preflight blocked'))

    const data = await runCatalogListQuery(listCtx(client), fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[0]).toBe('W/"1-carousel"')
    expect(data).toEqual([episode])
  })
})
