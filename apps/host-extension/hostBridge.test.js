import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  HOST_BRIDGE_CHANNEL,
  createHostBridgeRequest,
  isHostBridgeEnvelope,
} from './hostBridge.js'

describe('host bridge envelope', () => {
  it('accepts v1 envelopes with a requestId and known type', () => {
    const request = createHostBridgeRequest('HOST_JWT_REQUEST', 'req-1')
    assert.equal(request.channel, HOST_BRIDGE_CHANNEL)
    assert.equal(request.v, 1)
    assert.equal(isHostBridgeEnvelope(request), true)
    assert.equal(
      isHostBridgeEnvelope({
        ...request,
        type: 'HOST_MEDIA_PLAY',
      }),
      true,
    )
    assert.equal(
      isHostBridgeEnvelope({
        ...request,
        type: 'HOST_MEDIA_CONTROL_RESPONSE',
        ok: true,
      }),
      true,
    )
  })

  it('rejects wrong channel, version, type, or missing requestId', () => {
    const request = createHostBridgeRequest('HOST_JWT_REQUEST', 'req-1')
    assert.equal(isHostBridgeEnvelope({ ...request, channel: 'other' }), false)
    assert.equal(isHostBridgeEnvelope({ ...request, v: 2 }), false)
    assert.equal(isHostBridgeEnvelope({ ...request, type: 'OTHER' }), false)
    assert.equal(isHostBridgeEnvelope({ ...request, requestId: '' }), false)
    assert.equal(isHostBridgeEnvelope(null), false)
  })
})
