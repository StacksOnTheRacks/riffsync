import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHostBridgeRequest } from './hostBridge.js'
import { isAllowedHostBridgeOrigin, shouldForwardPageBridgeMessage } from './hostBridgeRelay.js'

describe('host bridge content-script relay', () => {
  it('allows only C1 SPA origins', () => {
    assert.equal(isAllowedHostBridgeOrigin('https://riffsync.tv'), true)
    assert.equal(isAllowedHostBridgeOrigin('http://localhost:5173'), true)
    assert.equal(isAllowedHostBridgeOrigin('https://example.com'), false)
    assert.equal(isAllowedHostBridgeOrigin('http://127.0.0.1:5173'), false)
  })

  it('forwards matching requestId responses from window on an allowed origin', () => {
    const pageWindow = {}
    const request = createHostBridgeRequest('HOST_JWT_RESPONSE', 'req-1')
    const event = {
      source: pageWindow,
      origin: 'https://riffsync.tv',
      data: { ...request, ok: true, accessToken: 'fan-access' },
    }
    assert.equal(shouldForwardPageBridgeMessage(event, 'req-1', pageWindow), true)
  })

  it('drops disallowed origins, non-window sources, and other requestIds', () => {
    const pageWindow = {}
    const request = createHostBridgeRequest('HOST_JWT_RESPONSE', 'req-1')
    assert.equal(
      shouldForwardPageBridgeMessage(
        { source: pageWindow, origin: 'https://evil.example', data: request },
        'req-1',
        pageWindow,
      ),
      false,
    )
    assert.equal(
      shouldForwardPageBridgeMessage(
        { source: {}, origin: 'https://riffsync.tv', data: request },
        'req-1',
        pageWindow,
      ),
      false,
    )
    assert.equal(
      shouldForwardPageBridgeMessage(
        { source: pageWindow, origin: 'https://riffsync.tv', data: request },
        'other',
        pageWindow,
      ),
      false,
    )
  })
})
