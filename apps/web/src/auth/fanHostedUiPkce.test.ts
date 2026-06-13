// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeFanAuthCallback,
  startFanHostedUiForgotPassword,
  startFanHostedUiSignOut,
} from './fanHostedUiPkce'
import { clearFanTokens, setFanTokenBundle } from './fanTokens'

vi.mock('./fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fanTokens')>()
  return {
    ...actual,
    clearFanTokens: vi.fn(actual.clearFanTokens),
    setFanTokenBundle: vi.fn(actual.setFanTokenBundle),
  }
})

describe('fanHostedUiPkce account actions', () => {
  const assign = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_COGNITO_HOSTED_UI_DOMAIN', 'fan.example.auth.us-east-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'fan-client-id')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://riffsync.tv', assign },
    })
    sessionStorage.clear()
    assign.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('redirects to Cognito forgot-password with PKCE and return path stored', async () => {
    await startFanHostedUiForgotPassword('/account')

    expect(sessionStorage.getItem('riffsync.returnTo')).toBe('/account')
    expect(sessionStorage.getItem('riffsync.pkceVerifier')).toBeTruthy()
    expect(sessionStorage.getItem('riffsync.oauthState')).toBeTruthy()
    expect(sessionStorage.getItem('riffsync.passwordResetFlow')).toBe('1')
    expect(assign).toHaveBeenCalledTimes(1)
    const url = new URL(assign.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/forgotPassword')
    expect(url.searchParams.get('client_id')).toBe('fan-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://riffsync.tv/auth/callback')
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('clears local tokens and redirects to Cognito logout', () => {
    setFanTokenBundle('access', 3600)
    startFanHostedUiSignOut()

    expect(clearFanTokens).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledTimes(1)
    const url = new URL(assign.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/logout')
    expect(url.searchParams.get('client_id')).toBe('fan-client-id')
    expect(url.searchParams.get('logout_uri')).toBe('https://riffsync.tv/')
  })

  it('completes password-reset callback when Cognito omits state', async () => {
    sessionStorage.setItem('riffsync.returnTo', '/account')
    sessionStorage.setItem('riffsync.passwordResetFlow', '1')

    const result = await completeFanAuthCallback('auth-code-only')

    expect(result.nextPath).toBe('/account?passwordReset=1')
    expect(sessionStorage.getItem('riffsync.returnTo')).toBeNull()
    expect(sessionStorage.getItem('riffsync.passwordResetFlow')).toBeNull()
  })
})
