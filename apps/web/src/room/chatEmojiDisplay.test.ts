import { describe, expect, it } from 'vitest'
import { isEmojiOnlyChatMessage } from './chatEmojiDisplay'

describe('isEmojiOnlyChatMessage', () => {
  it('returns true for a single emoji', () => {
    expect(isEmojiOnlyChatMessage('🫠')).toBe(true)
  })

  it('returns true for multiple emoji with spaces', () => {
    expect(isEmojiOnlyChatMessage('😀 🎸')).toBe(true)
  })

  it('returns false for empty or whitespace-only text', () => {
    expect(isEmojiOnlyChatMessage('')).toBe(false)
    expect(isEmojiOnlyChatMessage('   ')).toBe(false)
  })

  it('returns false when text includes letters or numbers', () => {
    expect(isEmojiOnlyChatMessage('hello')).toBe(false)
    expect(isEmojiOnlyChatMessage('🎸 nice')).toBe(false)
    expect(isEmojiOnlyChatMessage('123')).toBe(false)
  })
})
