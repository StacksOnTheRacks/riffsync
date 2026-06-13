// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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

  it('redirects to Cognito forgot-password with return path stored', () => {
    startFanHostedUiForgotPassword('/account')

    expect(sessionStorage.getItem('riffsync.returnTo')).toBe('/account')
    expect(assign).toHaveBeenCalledTimes(1)
    const url = new URL(assign.mock.calls[0]![0] as string)
    expect(url.pathname).toBe('/forgotPassword')
    expect(url.searchParams.get('client_id')).toBe('fan-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://riffsync.tv/auth/callback')
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
})
