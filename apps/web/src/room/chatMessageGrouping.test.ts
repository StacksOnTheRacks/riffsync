import { describe, expect, it } from 'vitest'
import { isContinuedChatLine } from './chatMessageGrouping'

const lines = [
  { sessionId: 'a', text: 'one' },
  { sessionId: 'a', text: 'two' },
  { sessionId: 'b', text: 'three' },
  { sessionId: 'a', text: 'four' },
]

describe('isContinuedChatLine', () => {
  it('returns false for the first row', () => {
    expect(isContinuedChatLine(lines, 0)).toBe(false)
  })

  it('returns true when the previous row has the same sessionId', () => {
    expect(isContinuedChatLine(lines, 1)).toBe(true)
  })

  it('returns false when the previous row has a different sessionId', () => {
    expect(isContinuedChatLine(lines, 2)).toBe(false)
    expect(isContinuedChatLine(lines, 3)).toBe(false)
  })

  it('returns false for an empty list', () => {
    expect(isContinuedChatLine([], 0)).toBe(false)
  })
})
