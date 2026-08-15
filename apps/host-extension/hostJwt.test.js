import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createHostBridgeRequest } from './hostBridge.js'
import {
  JWT_REQUEST_TIMEOUT_MS,
  createEphemeralJwtCache,
  requestHostAccessToken,
} from './hostJwt.js'

describe('ephemeral JWT cache', () => {
  it('stores and drops access tokens in memory only', () => {
    const cache = createEphemeralJwtCache()
    cache.store('fan-access')
    assert.equal(cache.peek(), 'fan-access')
    cache.drop()
    assert.equal(cache.peek(), null)
  })
})

describe('requestHostAccessToken', () => {
  it('returns a fan access token from a matching HOST_JWT_RESPONSE', async () => {
    const result = await requestHostAccessToken({
      tabId: 9,
      createRequestId: () => 'req-1',
      sendMessage: async (_tabId, message) => ({
        ...createHostBridgeRequest('HOST_JWT_RESPONSE', message.requestId),
        ok: true,
        accessToken: 'fan-access',
      }),
    })
    assert.deepEqual(result, { ok: true, accessToken: 'fan-access' })
  })

  it('maps a missing content script to content_script_missing', async () => {
    const result = await requestHostAccessToken({
      tabId: 9,
      sendMessage: async () => {
        throw new Error('Could not establish connection. Receiving end does not exist.')
      },
    })
    assert.deepEqual(result, { ok: false, error: 'content_script_missing' })
  })

  it('times out as an auth error', async () => {
    const result = await requestHostAccessToken({
      tabId: 9,
      timeoutMs: 10,
      sendMessage: () => new Promise(() => {}),
    })
    assert.deepEqual(result, { ok: false, error: 'timeout' })
    assert.equal(JWT_REQUEST_TIMEOUT_MS, 5000)
  })

  it('does not persist tokens to chrome.storage or handle refresh tokens', () => {
    const src = readFileSync(new URL('./hostJwt.js', import.meta.url), 'utf8')
    assert.equal(src.includes('chrome.storage'), false)
    assert.equal(/refresh[_]?token/i.test(src), false)
  })
})
