import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fetchRoomNowPlaying, patchRoomCatalogEpisode } from './roomsApi.js'

const BASE = 'https://xxxx.execute-api.us-east-1.amazonaws.com'
const ROOM_ID = 'party-1'
const ROOM_URL = `${BASE}/v1/rooms/${ROOM_ID}`

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
  }
}

describe('fetchRoomNowPlaying', () => {
  it('GETs {base}/v1/rooms/{id} anonymously and returns the room', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({
        room: { roomId: ROOM_ID, displayTitle: 'Mitchell', catalogEpisodeId: '032-mitchell' },
      })
    }

    const result = await fetchRoomNowPlaying(`${BASE}/`, ROOM_ID, fetchImpl)

    assert.equal(result.status, 'ok')
    assert.equal(result.room.displayTitle, 'Mitchell')
    assert.equal(calls[0].url, ROOM_URL)
    assert.equal(calls[0].init.method, 'GET')
    assert.equal(calls[0].init.headers.Authorization, undefined)
  })

  it('treats HTTP 404 and a missing room body as missing', async () => {
    const missingHttp = await fetchRoomNowPlaying(BASE, ROOM_ID, async () =>
      jsonResponse({ error: 'not found' }, 404),
    )
    assert.equal(missingHttp.status, 'missing')

    const missingBody = await fetchRoomNowPlaying(BASE, ROOM_ID, async () => jsonResponse({}))
    assert.equal(missingBody.status, 'missing')
  })

  it('returns error for network and malformed JSON, and unbound without inventing a room id', async () => {
    const network = await fetchRoomNowPlaying(BASE, ROOM_ID, async () => {
      throw new Error('offline')
    })
    assert.equal(network.status, 'error')
    assert.equal(network.reason, 'network')

    const malformed = await fetchRoomNowPlaying(BASE, ROOM_ID, async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError('bad json')
      },
    }))
    assert.equal(malformed.status, 'error')
    assert.equal(malformed.reason, 'malformed')

    let called = 0
    const unbound = await fetchRoomNowPlaying(BASE, '', async () => {
      called += 1
      return jsonResponse({ room: { roomId: 'invented' } })
    })
    assert.equal(unbound.status, 'unbound')
    assert.equal(called, 0)
  })
})

describe('patchRoomCatalogEpisode', () => {
  it('PATCHes { catalogEpisodeId } only with Bearer fan access JWT', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url, init })
      return jsonResponse({ catalogEpisodeId: '032-mitchell' }, 200)
    }

    const result = await patchRoomCatalogEpisode(
      BASE,
      { roomId: ROOM_ID, accessToken: 'fan-access', catalogEpisodeId: '032-mitchell' },
      fetchImpl,
    )

    assert.equal(result.ok, true)
    assert.equal(calls[0].url, ROOM_URL)
    assert.equal(calls[0].init.method, 'PATCH')
    assert.equal(calls[0].init.headers.Authorization, 'Bearer fan-access')
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json')
    assert.equal(calls[0].init.headers.Accept, 'application/json')
    assert.equal(calls[0].init.body, JSON.stringify({ catalogEpisodeId: '032-mitchell' }))
    assert.equal(calls[0].init.body.includes('displayTitle'), false)
  })

  it('maps 401 / 403 / 404 / 400 codes / 409 / network to distinct results', async () => {
    const http = async (status, body = {}) =>
      patchRoomCatalogEpisode(
        BASE,
        { roomId: ROOM_ID, accessToken: 'fan-access', catalogEpisodeId: '032-mitchell' },
        async () => jsonResponse(body, status),
      )

    assert.equal((await http(401)).status, 401)
    assert.equal((await http(403)).status, 403)
    assert.equal((await http(404)).status, 404)
    assert.equal((await http(409)).status, 409)

    const notFound = await http(400, { code: 'catalog_episode_not_found' })
    assert.equal(notFound.status, 400)
    assert.equal(notFound.code, 'catalog_episode_not_found')

    const youtube = await http(400, { code: 'catalog_episode_youtube_id_missing' })
    assert.equal(youtube.code, 'catalog_episode_youtube_id_missing')

    const custom = await http(400, { code: 'catalog_episode_custom_url_missing' })
    assert.equal(custom.code, 'catalog_episode_custom_url_missing')

    const network = await patchRoomCatalogEpisode(
      BASE,
      { roomId: ROOM_ID, accessToken: 'fan-access', catalogEpisodeId: '032-mitchell' },
      async () => {
        throw new Error('offline')
      },
    )
    assert.equal(network.reason, 'network')
    assert.equal(network.ok, false)
  })
})
