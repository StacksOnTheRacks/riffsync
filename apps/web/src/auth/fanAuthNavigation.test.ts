// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFanAuthUrl,
  normalizeFanReturnTo,
  popReturnTo,
} from './fanAuthNavigation'
import { completeFanAuthCallback } from './fanHostedUiPkce'

describe('fanAuthNavigation', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it.each([
    ['/catalog/mst3k', '/catalog/mst3k'],
    ['/catalog/mst3k?tab=shorts', '/catalog/mst3k?tab=shorts'],
    ['/account', '/account'],
  ])('allows safe fan path %s', (input, expected) => {
    expect(normalizeFanReturnTo(input)).toBe(expected)
  })

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    'javascript:alert(1)',
    'data:text/html,hi',
    '/auth/callback',
    '/auth/sign-in',
    '/auth/sign-up',
    '/auth/verify-email',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/change-password',
    '/admin/login',
    '/admin/catalog',
    '%2F%2Fevil.example/phish',
    '/%2Fevil.example/phish',
  ])('rejects unsafe returnTo %s → /catalog', (input) => {
    expect(normalizeFanReturnTo(input)).toBe('/catalog')
  })

  it('buildFanAuthUrl persists sanitized returnTo in sessionStorage', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/live', search: '', hash: '', assign: vi.fn() },
    })

    const url = buildFanAuthUrl('/auth/sign-in', '/account')
    expect(url).toBe('/auth/sign-in?returnTo=%2Faccount')
    expect(sessionStorage.getItem('riffsync.returnTo')).toBe('/account')
  })

  it('popReturnTo reads, clears, and sanitizes sessionStorage', () => {
    sessionStorage.setItem('riffsync.returnTo', '/auth/sign-in')
    expect(popReturnTo()).toBe('/catalog')
    expect(sessionStorage.getItem('riffsync.returnTo')).toBeNull()
  })

  it('completeFanAuthCallback nextPath uses the same sanitizer', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://riffsync.tv' },
    })
    sessionStorage.setItem('riffsync.returnTo', 'javascript:alert(1)')
    sessionStorage.setItem('riffsync.passwordResetFlow', '1')

    const result = await completeFanAuthCallback('auth-code-only')
    expect(result.nextPath).toBe('/catalog?passwordReset=1')
  })
})
