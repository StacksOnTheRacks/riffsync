// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildStrippedResetSearch,
  readFanResetQueryPrefill,
  resetQueryHasSecrets,
  stripFanResetQueryFromUrl,
} from './fanResetQuery'

describe('fanResetQuery', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('reads code and email params with normalized returnTo', () => {
    const prefill = readFanResetQueryPrefill(
      '?confirmation_code=secret-code&email=fan@example.com&returnTo=/account',
    )
    expect(prefill.code).toBe('secret-code')
    expect(prefill.email).toBe('fan@example.com')
    expect(prefill.returnTo).toBe('/account')
  })

  it('prefers confirmation_code over code', () => {
    const prefill = readFanResetQueryPrefill('?code=first&confirmation_code=second')
    expect(prefill.code).toBe('second')
  })

  it('buildStrippedResetSearch omits default returnTo', () => {
    expect(buildStrippedResetSearch('/catalog')).toBe('')
    expect(buildStrippedResetSearch('/account')).toBe('?returnTo=%2Faccount')
  })

  it('stripFanResetQueryFromUrl removes secrets and keeps returnTo', () => {
    window.history.replaceState(null, '', '/auth/reset-password?confirmation_code=secret-code&returnTo=/account')

    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const prefill = stripFanResetQueryFromUrl('/auth/reset-password', '?confirmation_code=secret-code&returnTo=/account', '')

    expect(prefill.code).toBe('secret-code')
    expect(prefill.returnTo).toBe('/account')
    expect(replaceSpy).toHaveBeenCalled()
    expect(window.location.pathname).toBe('/auth/reset-password')
    expect(window.location.search).toBe('?returnTo=%2Faccount')
    expect(window.location.search).not.toContain('confirmation_code')
  })

  it('stripFanResetQueryFromUrl is a no-op when no secrets are present', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const prefill = stripFanResetQueryFromUrl('/auth/reset-password', '?returnTo=/account', '')

    expect(prefill.code).toBeNull()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('resetQueryHasSecrets detects code params', () => {
    expect(resetQueryHasSecrets('?code=abc')).toBe(true)
    expect(resetQueryHasSecrets('?returnTo=/account')).toBe(false)
  })
})
