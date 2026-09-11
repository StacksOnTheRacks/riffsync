// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signIn as amplifySignIn, fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth'
import { resetFanCognitoConfigForTests } from './fanCognitoConfig'
import {
  FanAuthError,
  setFanSrpClientForTests,
  signInWithSrp,
} from './fanSrpAuth'
import { setFanTokenBundle } from './fanTokens'

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
}))

vi.mock('aws-amplify', () => ({
  Amplify: { configure: vi.fn() },
}))

vi.mock('./fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fanTokens')>()
  return {
    ...actual,
    setFanTokenBundle: vi.fn(actual.setFanTokenBundle),
  }
})

describe('fanSrpAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetFanCognitoConfigForTests()
    setFanSrpClientForTests(null)
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool')
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'fan-client-id')
    vi.stubEnv('VITE_COGNITO_REGION', 'us-east-1')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    setFanSrpClientForTests(null)
    resetFanCognitoConfigForTests()
  })

  it('completes USER_SRP_AUTH and writes tokens via setFanTokenBundle', async () => {
    const signIn = vi.fn().mockResolvedValue({ isSignedIn: true })
    const fetchSession = vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      expiresIn: 3600,
      refreshToken: 'refresh-token',
    })
    const signOut = vi.fn().mockResolvedValue(undefined)

    setFanSrpClientForTests({ signIn, fetchSession, signOut })

    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await signInWithSrp('fan@example.com', 'secret')

    expect(signIn).toHaveBeenCalledWith('fan@example.com', 'secret')
    expect(setFanTokenBundle).toHaveBeenCalledWith('access-token', 3600, {
      refreshToken: 'refresh-token',
    })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(result.accessToken).toBe('access-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not write tokens on failure', async () => {
    setFanSrpClientForTests({
      signIn: vi.fn().mockRejectedValue(Object.assign(new Error('Bad credentials'), { name: 'NotAuthorizedException' })),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
    })

    await expect(signInWithSrp('fan@example.com', 'wrong')).rejects.toBeInstanceOf(FanAuthError)
    expect(setFanTokenBundle).not.toHaveBeenCalled()
  })

  it('uses Amplify USER_SRP_AUTH when no test client override is set', async () => {
    vi.mocked(amplifySignIn).mockResolvedValue({ isSignedIn: true } as never)
    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        accessToken: {
          toString: () => 'amplify-access',
          payload: { exp: 4000, iat: 400 },
        },
        refreshToken: { toString: () => 'amplify-refresh' },
      },
    } as never)
    vi.mocked(amplifySignOut).mockResolvedValue(undefined)

    await signInWithSrp('fan@example.com', 'secret')

    expect(amplifySignIn).toHaveBeenCalledWith({
      username: 'fan@example.com',
      password: 'secret',
      options: { authFlowType: 'USER_SRP_AUTH' },
    })
  })

  it('maps NEW_PASSWORD_REQUIRED without writing tokens', async () => {
    setFanSrpClientForTests({
      signIn: vi.fn().mockResolvedValue({
        isSignedIn: false,
        nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
      }),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
    })

    await expect(signInWithSrp('fan@example.com', 'secret')).rejects.toMatchObject({
      code: 'NEW_PASSWORD_REQUIRED',
    })
    expect(setFanTokenBundle).not.toHaveBeenCalled()
  })
})
