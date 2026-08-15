import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchPublicCatalog, normalizeEpisode, selectCatalogRow } from './catalogApi.js'
import { getPublicApiBaseUrl } from './publicApiBaseUrl.js'

const BASE = 'https://xxxx.execute-api.us-east-1.amazonaws.com'
const LIST_URL = `${BASE}/v1/catalog`

function episodeRaw(overrides = {}) {
  return {
    id: '032-mitchell',
    title: 'Mitchell',
    experimentNumber: 32,
    catalog: 'mst3k',
    tags: ['mst3k'],
    labels: ['classic'],
    youtubeVideoId: 'NXGXtm6gcxk',
    youtubeWatchUrl: 'https://www.youtube.com/watch?v=NXGXtm6gcxk',
    posterImageUrl: 'https://example.com/poster.jpg',
    tagline: 'A movie',
    embedAllows: true,
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    ...overrides,
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
  }
}

describe('getPublicApiBaseUrl', () => {
  it('trims and strips a trailing slash on an HTTPS origin', () => {
    assert.equal(getPublicApiBaseUrl(`  ${BASE}/  `), BASE)
  })

  it('returns undefined for missing, empty, or invalid values', () => {
    assert.equal(getPublicApiBaseUrl(undefined), undefined)
    assert.equal(getPublicApiBaseUrl(''), undefined)
    assert.equal(getPublicApiBaseUrl('   '), undefined)
    assert.equal(getPublicApiBaseUrl('not-a-url'), undefined)
    assert.equal(getPublicApiBaseUrl('http://api.example.com'), undefined)
    assert.equal(getPublicApiBaseUrl('https://'), undefined)
  })
})

describe('fetchPublicCatalog', () => {
  it('GETs {base}/v1/catalog with no auth header and no carousel/spotlight filters', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ version: 1, entries: [episodeRaw()] })
    }

    const result = await fetchPublicCatalog(`${BASE}/`, fetchImpl)

    assert.equal(result.status, 'ok')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, LIST_URL)
    assert.equal(new URL(calls[0].url).search, '')
    assert.equal(calls[0].init?.method, 'GET')
    const headers = calls[0].init?.headers ?? {}
    const headerNames = Object.keys(headers).map((name) => name.toLowerCase())
    assert.equal(headerNames.includes('authorization'), false)
    assert.equal(headers.Authorization, undefined)
    assert.equal(headers.authorization, undefined)
  })

  it('returns list data so selection can store id and rows have title', async () => {
    const fetchImpl = async () => jsonResponse({ version: 1, entries: [episodeRaw()] })

    const result = await fetchPublicCatalog(BASE, fetchImpl)
    const selected = selectCatalogRow(result.entries, '032-mitchell')

    assert.equal(result.status, 'ok')
    assert.equal(result.entries.length, 1)
    assert.equal(result.entries[0].id, '032-mitchell')
    assert.equal(result.entries[0].title, 'Mitchell')
    assert.equal(selected.id, '032-mitchell')
    assert.equal(selected.row.title, 'Mitchell')
    assert.equal(selected.row.youtubeVideoId, 'NXGXtm6gcxk')
    assert.equal(selected.row.embedAllows, true)
  })

  it('returns empty (not error) when entries is an empty array', async () => {
    const fetchImpl = async () => jsonResponse({ version: 1, entries: [] })

    const result = await fetchPublicCatalog(BASE, fetchImpl)

    assert.equal(result.ok, true)
    assert.equal(result.status, 'empty')
    assert.deepEqual(result.entries, [])
    assert.notEqual(result.status, 'error')
  })

  it('returns error for non-OK HTTP, network throw, invalid JSON, and missing entries', async () => {
    const http = await fetchPublicCatalog(BASE, async () => jsonResponse({ version: 1, entries: [] }, 500))
    assert.equal(http.status, 'error')
    assert.equal(http.reason, 'http')

    const network = await fetchPublicCatalog(BASE, async () => {
      throw new Error('network down')
    })
    assert.equal(network.status, 'error')
    assert.equal(network.reason, 'network')

    const invalidJson = await fetchPublicCatalog(BASE, async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError('Unexpected token')
      },
    }))
    assert.equal(invalidJson.status, 'error')
    assert.equal(invalidJson.reason, 'malformed')

    const missingEntries = await fetchPublicCatalog(BASE, async () => jsonResponse({ version: 1 }))
    assert.equal(missingEntries.status, 'error')
    assert.equal(missingEntries.reason, 'malformed')
  })

  it('returns error for missing, empty, or invalid PUBLIC_API_BASE_URL without fetching', async () => {
    let called = 0
    const fetchImpl = async () => {
      called += 1
      return jsonResponse({ version: 1, entries: [] })
    }

    for (const base of [undefined, '', '   ', 'http://api.example.com', 'not-a-url']) {
      const result = await fetchPublicCatalog(base, fetchImpl)
      assert.equal(result.status, 'error')
      assert.equal(result.reason, 'invalid-base-url')
    }

    assert.equal(called, 0)
  })

  it('can retry after an error without a new fetch helper', async () => {
    let attempts = 0
    const fetchImpl = async () => {
      attempts += 1
      if (attempts === 1) throw new Error('network down')
      return jsonResponse({ version: 1, entries: [episodeRaw()] })
    }

    const first = await fetchPublicCatalog(BASE, fetchImpl)
    const second = await fetchPublicCatalog(BASE, fetchImpl)

    assert.equal(first.status, 'error')
    assert.equal(second.status, 'ok')
    assert.equal(attempts, 2)
  })
})

describe('normalizeEpisode', () => {
  it('keeps list UX and host-source URL fields', () => {
    const row = normalizeEpisode(episodeRaw({ embedAllows: false, playbackHost: 'custom' }))
    assert.equal(row.id, '032-mitchell')
    assert.equal(row.title, 'Mitchell')
    assert.equal(row.experimentNumber, 32)
    assert.equal(row.posterImageUrl, 'https://example.com/poster.jpg')
    assert.equal(row.embedAllows, false)
    assert.equal(row.playbackHost, 'custom')
    assert.equal(row.youtubeWatchUrl, 'https://www.youtube.com/watch?v=NXGXtm6gcxk')
    assert.equal(row.youtubeVideoId, 'NXGXtm6gcxk')
  })
})
