import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchGiphy } from './giphySearchApi'

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.example.test',
}))

describe('searchGiphy', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns normalized results on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            giphyId: 'abc',
            title: 'Cat',
            previewUrl: 'https://media0.giphy.com/media/abc/p.gif',
            renditionUrl: 'https://media0.giphy.com/media/abc/r.gif',
            width: 200,
            height: 150,
          },
        ],
      }),
    })

    const out = await searchGiphy('token-abc', { q: 'cats', limit: 10, offset: 5 })

    expect(out.results).toHaveLength(1)
    expect(out.results[0]?.giphyId).toBe('abc')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.test/v1/giphy/search?q=cats&limit=10&offset=5')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-abc',
      Accept: 'application/json',
    })
  })

  it('surfaces 401 from the API', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '',
    })

    await expect(searchGiphy('bad-token', { q: 'hi' })).rejects.toThrow(/Sign in again/i)
  })

  it('surfaces 400 from the API', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'Invalid query parameters' }),
    })

    await expect(searchGiphy('token', { q: 'hi' })).rejects.toThrow(/Invalid query parameters/i)
  })

  it('surfaces 429 from the API', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: 'Giphy search rate limit exceeded' }),
    })

    await expect(searchGiphy('token', { q: 'hi' })).rejects.toThrow(/rate limit exceeded/i)
  })

  it('rejects empty query without network', async () => {
    await expect(searchGiphy('token', { q: '   ' })).rejects.toThrow(/search term/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
