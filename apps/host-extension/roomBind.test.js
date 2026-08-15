import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseRoomBind } from './roomBind.js'

describe('parseRoomBind', () => {
  it('binds roomId from https://riffsync.tv/room/:roomId', () => {
    assert.deepEqual(parseRoomBind('https://riffsync.tv/room/abc-123'), {
      roomId: 'abc-123',
      origin: 'https://riffsync.tv',
    })
  })

  it('binds roomId from the localhost SPA origin', () => {
    assert.deepEqual(parseRoomBind('http://localhost:5173/room/local-room'), {
      roomId: 'local-room',
      origin: 'http://localhost:5173',
    })
  })

  it('allows a trailing slash on the room path', () => {
    assert.equal(parseRoomBind('https://riffsync.tv/room/abc-123/')?.roomId, 'abc-123')
  })

  it('returns null when the origin is not allowed', () => {
    assert.equal(parseRoomBind('https://example.com/room/abc-123'), null)
    assert.equal(parseRoomBind('http://127.0.0.1:5173/room/abc-123'), null)
  })

  it('returns null when the path is not /room/:roomId', () => {
    assert.equal(parseRoomBind('https://riffsync.tv/watch/032-mitchell'), null)
    assert.equal(parseRoomBind('https://riffsync.tv/'), null)
    assert.equal(parseRoomBind('https://riffsync.tv/room/'), null)
  })
})
