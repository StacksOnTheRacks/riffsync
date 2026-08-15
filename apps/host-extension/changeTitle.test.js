import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyTitleChange, titleChangeErrorMessage } from './changeTitle.js'
import { createEphemeralJwtCache } from './hostJwt.js'
import { resolveHostSourceTabUrl } from './hostSourceTabUrl.js'

const ROOM_URL = 'https://riffsync.tv/room/party-1'
const ROW = {
  id: '032-mitchell',
  embedAllows: true,
  youtubeWatchUrl: 'https://www.youtube.com/watch?v=NXGXtm6gcxk',
  youtubeVideoId: 'NXGXtm6gcxk',
  playbackHost: 'youtube',
}

function createDeps(overrides = {}) {
  const jwtCache = createEphemeralJwtCache()
  const calls = { jwt: 0, patch: [], navigate: [] }
  return {
    calls,
    jwtCache,
    args: {
      activeTabUrl: ROOM_URL,
      partyTabId: 3,
      catalogEpisodeId: '032-mitchell',
      catalogRow: ROW,
      jwtCache,
      requestJwt: async () => {
        calls.jwt += 1
        return { ok: true, accessToken: `token-${calls.jwt}` }
      },
      patchRoom: async (args) => {
        calls.patch.push(args)
        return { ok: true, status: 200 }
      },
      resolveUrl: resolveHostSourceTabUrl,
      navigate: async ({ url }) => {
        calls.navigate.push({ url, active: false })
        return { ok: true }
      },
      ...overrides,
    },
  }
}

describe('applyTitleChange', () => {
  it('after PATCH 200, navigates the media tab with active: false', async () => {
    const { args, calls } = createDeps()
    const result = await applyTitleChange(args)

    assert.equal(result.ok, true)
    assert.equal(result.navigated, true)
    assert.equal(calls.patch.length, 1)
    assert.equal(calls.patch[0].catalogEpisodeId, '032-mitchell')
    assert.equal(calls.patch[0].accessToken, 'token-1')
    assert.equal(calls.navigate.length, 1)
    assert.equal(calls.navigate[0].active, false)
    assert.equal(
      calls.navigate[0].url,
      'https://riffsync.tv/watch/032-mitchell?partyCapture=1',
    )
  })

  it('does not navigate when PATCH fails', async () => {
    const { args, calls } = createDeps({
      patchRoom: async () => ({ ok: false, status: 403, reason: 'http' }),
    })
    const result = await applyTitleChange(args)

    assert.equal(result.ok, false)
    assert.equal(result.status, 403)
    assert.equal(calls.navigate.length, 0)
  })

  it('refuses PATCH and navigate when C1 is unbound', async () => {
    const { args, calls } = createDeps({
      activeTabUrl: 'https://riffsync.tv/watch/032-mitchell',
    })
    const result = await applyTitleChange(args)

    assert.equal(result.ok, false)
    assert.equal(result.reason, 'unbound')
    assert.equal(calls.patch.length, 0)
    assert.equal(calls.navigate.length, 0)
    assert.equal(calls.jwt, 0)
  })

  it('retries JWT once after PATCH 401, then fails without navigating', async () => {
    let patches = 0
    const { args, calls, jwtCache } = createDeps({
      patchRoom: async () => {
        patches += 1
        return { ok: false, status: 401, reason: 'http' }
      },
    })
    jwtCache.store('stale')
    const result = await applyTitleChange(args)

    assert.equal(result.ok, false)
    assert.equal(result.status, 401)
    assert.equal(patches, 2)
    assert.equal(calls.jwt, 1)
    assert.equal(calls.navigate.length, 0)
    assert.equal(jwtCache.peek(), 'token-1')
  })
})

describe('titleChangeErrorMessage', () => {
  it('maps unbound, auth, http, and catalog codes to distinct copy', () => {
    assert.match(titleChangeErrorMessage({ reason: 'unbound' }), /Not on a room tab/)
    assert.match(titleChangeErrorMessage({ reason: 'auth', error: 'not_signed_in' }), /Sign in/)
    assert.match(titleChangeErrorMessage({ reason: 'auth', error: 'timeout' }), /timed out/)
    assert.match(
      titleChangeErrorMessage({ reason: 'auth', error: 'unsupported' }),
      /Host bridge did not answer/,
    )
    assert.match(titleChangeErrorMessage({ status: 403 }), /not the host/)
    assert.match(titleChangeErrorMessage({ status: 409 }), /Retry/)
    assert.match(
      titleChangeErrorMessage({ code: 'catalog_episode_youtube_id_missing' }),
      /YouTube id/,
    )
  })
})
