import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatMessageId, parseInboundChatMessageId } from './chatMessageId'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseInboundChatMessageId', () => {
  it('returns trimmed message id for valid values', () => {
    expect(parseInboundChatMessageId(' abc-123 ')).toBe('abc-123')
  })

  it('returns null for non-string values', () => {
    expect(parseInboundChatMessageId(null)).toBeNull()
    expect(parseInboundChatMessageId(42)).toBeNull()
  })

  it('returns null for empty message id', () => {
    expect(parseInboundChatMessageId('   ')).toBeNull()
  })

  it('returns null for message id longer than max length', () => {
    expect(parseInboundChatMessageId('x'.repeat(65))).toBeNull()
  })
})

describe('createChatMessageId', () => {
  it('uses crypto.randomUUID', () => {
    const randomUUID = vi.fn(() => 'uuid-value')
    vi.stubGlobal('crypto', { randomUUID } as unknown as Crypto)

    expect(createChatMessageId()).toBe('uuid-value')
    expect(randomUUID).toHaveBeenCalledOnce()
  })
})
