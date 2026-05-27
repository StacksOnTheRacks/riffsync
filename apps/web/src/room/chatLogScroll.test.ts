import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_LOG_STICK_THRESHOLD_PX,
  chatLogScrollBehavior,
  isChatLogNearBottom,
  prefersReducedMotion,
} from './chatLogScroll'

function metrics(scrollTop: number, clientHeight: number, scrollHeight: number) {
  return { scrollTop, clientHeight, scrollHeight }
}

describe('isChatLogNearBottom', () => {
  it('uses the default 48px threshold', () => {
    const el = metrics(104, 200, 352)
    expect(isChatLogNearBottom(el)).toBe(true)
    expect(isChatLogNearBottom(metrics(103, 200, 352))).toBe(false)
  })

  it('honors a custom threshold', () => {
    const el = metrics(90, 200, 352)
    expect(isChatLogNearBottom(el, 64)).toBe(true)
    expect(isChatLogNearBottom(el, 32)).toBe(false)
  })

  it('is true when the log is empty or not scrollable', () => {
    expect(isChatLogNearBottom(metrics(0, 200, 200))).toBe(true)
  })

  it('exports the contract threshold constant', () => {
    expect(CHAT_LOG_STICK_THRESHOLD_PX).toBe(48)
  })
})

describe('prefersReducedMotion / chatLogScrollBehavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false when matchMedia is unavailable', () => {
    vi.stubGlobal('window', {})
    expect(prefersReducedMotion()).toBe(false)
    expect(chatLogScrollBehavior()).toBe('smooth')
  })

  it('uses auto scroll when reduce motion is preferred', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
      }),
    })
    expect(prefersReducedMotion()).toBe(true)
    expect(chatLogScrollBehavior()).toBe('auto')
  })

  it('uses smooth scroll otherwise', () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false, media: '' }),
    })
    expect(chatLogScrollBehavior()).toBe('smooth')
  })
})
