// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exchangeFanAuthorizationCode } from './fanOAuthToken'
import { setFanTokenBundle } from './fanTokens'

vi.mock('./fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fanTokens')>()
  return {
    ...actual,
    setFanTokenBundle: vi.fn(actual.setFanTokenBundle),
  }
})

describe('fanOAuthToken', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubEnv('VITE_COGNITO_HOSTED_UI_DOMAIN', 'fan.example.auth.us-east-1.amazoncognito.com')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'fan-client-id')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://riffsync.tv' },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('exchanges authorization code with code_verifier and no client_secret', async () => {
    sessionStorage.setItem('riffsync.pkceVerifier', 'verifier-123')
    sessionStorage.setItem('riffsync.oauthState', 'state-abc')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token',
        }),
        { status: 200 },
      ),
    )

    await exchangeFanAuthorizationCode('auth-code', 'state-abc')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]!
    const body = (init as RequestInit).body as string
    expect(body).toContain('code_verifier=verifier-123')
    expect(body).not.toContain('client_secret')
    expect(setFanTokenBundle).toHaveBeenCalledWith('access-token', 3600, {
      refreshToken: 'refresh-token',
    })
  })
})
