import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCatalogCarouselEntries,
  fetchCatalogEntries,
  fetchCatalogEpisodeById,
  normalizeCatalogEtag,
} from './catalogApi'

const API_BASE = 'https://api.example.test'

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => API_BASE,
}))

describe('normalizeCatalogEtag', () => {
  it('trims weak ETag values', () => {
    expect(normalizeCatalogEtag('  W/"42-full"  ')).toBe('W/"42-full"')
  })
})

function mockFetchResponse(init: {
  status: number
  headers?: Record<string, string>
  body?: unknown
}): Response {
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  )
  return {
    status: init.status,
    ok: init.status >= 200 && init.status < 300,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    json: async () => init.body,
  } as Response
}

describe('catalogApi conditional GET', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchCatalogEntries sends If-None-Match and handles 304', async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse({ status: 304, headers: { ETag: 'W/"2-full"' } }),
    )

    const result = await fetchCatalogEntries('W/"1-full"')

    expect(result).toEqual({ kind: 'notModified' })
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/v1/catalog`, {
      headers: { Accept: 'application/json', 'If-None-Match': 'W/"1-full"' },
    })
  })

  it('fetchCatalogEntries parses ETag and entries on 200', async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse({
        status: 200,
        headers: { ETag: 'W/"3-full"' },
        body: {
          entries: [
            {
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
            },
          ],
        },
      }),
    )

    const result = await fetchCatalogEntries()

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.etag).toBe('W/"3-full"')
    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.id).toBe('ep-1')
  })

  it('fetchCatalogCarouselEntries requests carousel query param', async () => {
    fetchMock.mockResolvedValue(
      mockFetchResponse({
        status: 200,
        headers: { ETag: 'W/"4-carousel"' },
        body: { entries: [] },
      }),
    )

    await fetchCatalogCarouselEntries()

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/v1/catalog?carousel=true`, {
      headers: { Accept: 'application/json' },
    })
  })

  it('fetchCatalogEpisodeById handles 304 and 200', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({ status: 304, headers: { ETag: 'W/"5-episode-ep-1"' } }),
    )
    expect(await fetchCatalogEpisodeById('ep-1', 'W/"4-episode-ep-1"')).toEqual({
      kind: 'notModified',
    })

    fetchMock.mockResolvedValueOnce(
      mockFetchResponse({
        status: 200,
        headers: { ETag: 'W/"6-episode-ep-1"' },
        body: { entry: { id: 'ep-1', experimentNumber: 1, title: 'T', era: 'mike' } },
      }),
    )
    const ok = await fetchCatalogEpisodeById('ep-1')
    expect(ok.kind).toBe('ok')
    if (ok.kind !== 'ok') return
    expect(ok.entry?.id).toBe('ep-1')
    expect(ok.etag).toBe('W/"6-episode-ep-1"')
  })
})
