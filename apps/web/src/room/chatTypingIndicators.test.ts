import { describe, expect, it } from 'vitest'
import {
  applyInboundTyping,
  listRemoteTyping,
  pruneExpiredTyping,
  TYPING_INDICATOR_TTL_MS,
} from './chatTypingIndicators'

describe('chatTypingIndicators', () => {
  it('adds typing entry on start with 5s TTL', () => {
    const now = 1_000_000
    const next = applyInboundTyping(
      new Map(),
      { sessionId: 's1', displayName: 'Alice', action: 'start' },
      now,
    )
    expect(next.get('s1')).toEqual({
      sessionId: 's1',
      displayName: 'Alice',
      expiresAt: now + TYPING_INDICATOR_TTL_MS,
    })
  })

  it('removes typing entry on stop', () => {
    const seeded = applyInboundTyping(new Map(), {
      sessionId: 's1',
      displayName: 'Alice',
      action: 'start',
    })
    const next = applyInboundTyping(seeded, {
      sessionId: 's1',
      displayName: 'Alice',
      action: 'stop',
    })
    expect(next.has('s1')).toBe(false)
  })

  it('prunes expired entries', () => {
    const now = 5_000
    const seeded = applyInboundTyping(
      new Map(),
      { sessionId: 's1', displayName: 'Alice', action: 'start' },
      now,
    )
    const pruned = pruneExpiredTyping(seeded, now + TYPING_INDICATOR_TTL_MS + 1)
    expect(pruned.size).toBe(0)
  })

  it('excludes own session from remote typing list', () => {
    const now = 10_000
    const seeded = applyInboundTyping(
      new Map(),
      { sessionId: 'self', displayName: 'Me', action: 'start' },
      now,
    )
    const withPeer = applyInboundTyping(seeded, {
      sessionId: 'peer',
      displayName: 'Bob',
      action: 'start',
    }, now)
    const listed = listRemoteTyping(withPeer, 'self', now)
    expect(listed).toHaveLength(1)
    expect(listed[0]?.sessionId).toBe('peer')
  })
})
