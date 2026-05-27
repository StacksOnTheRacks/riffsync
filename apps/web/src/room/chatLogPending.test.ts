import { describe, expect, it } from 'vitest'
import {
  countNewChatLines,
  jumpToLatestButtonLabel,
  nextPendingBelowCount,
  pendingCountAfterNearBottomScroll,
  shouldShowJumpToLatest,
} from './chatLogPending'

describe('countNewChatLines', () => {
  it('returns zero when length is unchanged or shrinks', () => {
    expect(countNewChatLines(5, 5)).toBe(0)
    expect(countNewChatLines(6, 4)).toBe(0)
  })

  it('returns the positive delta when messages are added', () => {
    expect(countNewChatLines(10, 11)).toBe(1)
    expect(countNewChatLines(0, 3)).toBe(3)
  })
})

describe('nextPendingBelowCount', () => {
  it('resets pending when the user was near the bottom', () => {
    expect(nextPendingBelowCount(4, 2, true)).toBe(0)
  })

  it('accumulates new lines when scrolled up', () => {
    expect(nextPendingBelowCount(0, 1, false)).toBe(1)
    expect(nextPendingBelowCount(2, 3, false)).toBe(5)
  })

  it('ignores zero new lines', () => {
    expect(nextPendingBelowCount(3, 0, false)).toBe(3)
  })
})

describe('pendingCountAfterNearBottomScroll', () => {
  it('clears pending when near bottom', () => {
    expect(pendingCountAfterNearBottomScroll(true, 7)).toBe(0)
  })

  it('keeps pending when still scrolled up', () => {
    expect(pendingCountAfterNearBottomScroll(false, 7)).toBe(7)
  })
})

describe('jumpToLatestButtonLabel', () => {
  it('uses singular copy for zero or one pending line', () => {
    expect(jumpToLatestButtonLabel(0)).toBe('New messages')
    expect(jumpToLatestButtonLabel(1)).toBe('New messages')
  })

  it('appends the count when more than one line is pending', () => {
    expect(jumpToLatestButtonLabel(2)).toBe('New messages (2)')
    expect(jumpToLatestButtonLabel(12)).toBe('New messages (12)')
  })
})

describe('shouldShowJumpToLatest', () => {
  it('shows only when pending and not near bottom', () => {
    expect(shouldShowJumpToLatest(1, false)).toBe(true)
    expect(shouldShowJumpToLatest(0, false)).toBe(false)
    expect(shouldShowJumpToLatest(3, true)).toBe(false)
  })
})
