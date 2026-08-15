import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHostBridgeRequest } from './hostBridge.js'
import { requestMediaPlaybackControl } from './mediaControl.js'

const PARTY_URL = 'https://riffsync.tv/watch/005-eegah?partyCapture=1'
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=NXGXtm6gcxk'

describe('requestMediaPlaybackControl', () => {
  it('sends HOST_MEDIA_PLAY to a party-capture media tab', async () => {
    const calls = []
    const result = await requestMediaPlaybackControl({
      mediaTabId: 7,
      mediaTabUrl: PARTY_URL,
      action: 'play',
      createRequestId: () => 'req-play',
      sendMessage: async (tabId, message) => {
        calls.push({ tabId, message })
        return {
          ...createHostBridgeRequest('HOST_MEDIA_CONTROL_RESPONSE', message.requestId),
          ok: true,
        }
      },
    })

    assert.equal(result.ok, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].tabId, 7)
    assert.equal(calls[0].message.type, 'HOST_MEDIA_PLAY')
  })

  it('refuses direct YouTube media tabs without messaging', async () => {
    let called = 0
    const result = await requestMediaPlaybackControl({
      mediaTabId: 7,
      mediaTabUrl: YOUTUBE_URL,
      action: 'pause',
      sendMessage: async () => {
        called += 1
        return { ok: true }
      },
    })
    assert.deepEqual(result, { ok: false, reason: 'not_controllable' })
    assert.equal(called, 0)
  })

  it('refuses when the media tab is closed', async () => {
    const result = await requestMediaPlaybackControl({
      mediaTabId: null,
      mediaTabUrl: PARTY_URL,
      action: 'play',
      sendMessage: async () => ({ ok: true }),
    })
    assert.deepEqual(result, { ok: false, reason: 'media_tab_closed' })
  })

  it('maps player_unavailable from the page response', async () => {
    const result = await requestMediaPlaybackControl({
      mediaTabId: 7,
      mediaTabUrl: PARTY_URL,
      action: 'pause',
      createRequestId: () => 'req-1',
      sendMessage: async (_tabId, message) => ({
        ...createHostBridgeRequest('HOST_MEDIA_CONTROL_RESPONSE', message.requestId),
        ok: false,
        error: 'player_unavailable',
      }),
    })
    assert.deepEqual(result, { ok: false, reason: 'player_unavailable' })
  })
})
