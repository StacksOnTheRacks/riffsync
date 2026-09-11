// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapFanVerifyQueryStrip,
  buildStrippedVerifySearch,
  consumeFanVerifyBootstrapPrefill,
  readFanVerifyQueryPrefill,
  sanitizeVerifyGaPagePath,
  stripFanVerifyQueryFromUrl,
  verifyQueryHasSecrets,
} from './fanVerifyQuery'

describe('fanVerifyQuery', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('reads code and email params with normalized returnTo', () => {
    const prefill = readFanVerifyQueryPrefill(
      '?confirmation_code=secret-code&email=fan@example.com&returnTo=/account',
    )
    expect(prefill.code).toBe('secret-code')
    expect(prefill.email).toBe('fan@example.com')
    expect(prefill.returnTo).toBe('/account')
  })

  it('prefers confirmation_code over code', () => {
    const prefill = readFanVerifyQueryPrefill('?code=first&confirmation_code=second')
    expect(prefill.code).toBe('second')
  })

  it('buildStrippedVerifySearch omits default returnTo', () => {
    expect(buildStrippedVerifySearch('/catalog')).toBe('')
    expect(buildStrippedVerifySearch('/account')).toBe('?returnTo=%2Faccount')
  })

  it('stripFanVerifyQueryFromUrl removes secrets and keeps returnTo', () => {
    window.history.replaceState(null, '', '/auth/verify-email?confirmation_code=secret-code&returnTo=/account')

    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const prefill = stripFanVerifyQueryFromUrl(
      '/auth/verify-email',
      '?confirmation_code=secret-code&returnTo=/account',
      '',
    )

    expect(prefill.code).toBe('secret-code')
    expect(prefill.returnTo).toBe('/account')
    expect(replaceSpy).toHaveBeenCalled()
    expect(window.location.pathname).toBe('/auth/verify-email')
    expect(window.location.search).toBe('?returnTo=%2Faccount')
    expect(window.location.search).not.toContain('confirmation_code')
  })

  it('stripFanVerifyQueryFromUrl is a no-op when no secrets are present', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const prefill = stripFanVerifyQueryFromUrl('/auth/verify-email', '?returnTo=/account', '')

    expect(prefill.code).toBeNull()
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('verifyQueryHasSecrets detects code params', () => {
    expect(verifyQueryHasSecrets('?code=abc')).toBe(true)
    expect(verifyQueryHasSecrets('?returnTo=/account')).toBe(false)
  })

  it('sanitizeVerifyGaPagePath strips verify secrets from analytics paths', () => {
    expect(
      sanitizeVerifyGaPagePath('/auth/verify-email?confirmation_code=secret-code&returnTo=/account'),
    ).toBe('/auth/verify-email?returnTo=%2Faccount')
    expect(sanitizeVerifyGaPagePath('/catalog?genre=sci-fi')).toBe('/catalog?genre=sci-fi')
  })

  it('bootstrapFanVerifyQueryStrip strips URL and exposes one-time prefill', () => {
    window.history.replaceState(null, '', '/auth/verify-email?code=secret-code&email=fan@example.com')

    bootstrapFanVerifyQueryStrip()

    expect(window.location.search).not.toContain('code=')
    expect(consumeFanVerifyBootstrapPrefill()).toEqual({
      code: 'secret-code',
      email: 'fan@example.com',
    })
    expect(consumeFanVerifyBootstrapPrefill()).toEqual({ code: null, email: null })
  })
})
