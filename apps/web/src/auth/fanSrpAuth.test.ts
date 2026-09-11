// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmResetPassword,
  confirmSignUp,
  signIn as amplifySignIn,
  fetchAuthSession,
  resendSignUpCode,
  resetPassword,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
} from 'aws-amplify/auth'
import { resetFanCognitoConfigForTests } from './fanCognitoConfig'
import {
  FanAuthError,
  confirmFanPasswordReset,
  confirmFanSignUp,
  meetsFanPasswordPolicy,
  requestFanPasswordReset,
  resendFanConfirmationCode,
  setFanSrpClientForTests,
  signInWithSrp,
  signUpFan,
} from './fanSrpAuth'
import { setFanTokenBundle } from './fanTokens'

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUpCode: vi.fn(),
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

  it('requestFanPasswordReset resolves for UserNotFound without throwing', async () => {
    setFanSrpClientForTests({
      signIn: vi.fn(),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn().mockRejectedValue(Object.assign(new Error('User not found'), { name: 'UserNotFoundException' })),
    })

    await expect(requestFanPasswordReset('unknown@example.com')).resolves.toBeUndefined()
  })

  it('requestFanPasswordReset calls resetPassword with normalized email', async () => {
    const resetPasswordMock = vi.fn().mockResolvedValue(undefined)
    setFanSrpClientForTests({
      signIn: vi.fn(),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
      resetPassword: resetPasswordMock,
    })

    await requestFanPasswordReset(' Fan@Example.com ')
    expect(resetPasswordMock).toHaveBeenCalledWith('fan@example.com')
  })

  it('confirmFanPasswordReset calls confirmResetPassword and does not write tokens', async () => {
    const confirmResetPasswordMock = vi.fn().mockResolvedValue(undefined)
    setFanSrpClientForTests({
      signIn: vi.fn(),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
      confirmResetPassword: confirmResetPasswordMock,
    })

    await confirmFanPasswordReset({
      username: 'fan@example.com',
      confirmationCode: '123456',
      newPassword: 'NewPass1!',
    })

    expect(confirmResetPasswordMock).toHaveBeenCalledWith({
      username: 'fan@example.com',
      confirmationCode: '123456',
      newPassword: 'NewPass1!',
    })
    expect(setFanTokenBundle).not.toHaveBeenCalled()
  })

  it('maps CodeMismatchException on confirm reset', async () => {
    setFanSrpClientForTests({
      signIn: vi.fn(),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
      confirmResetPassword: vi.fn().mockRejectedValue(Object.assign(new Error('Mismatch'), { name: 'CodeMismatchException' })),
    })

    await expect(
      confirmFanPasswordReset({
        username: 'fan@example.com',
        confirmationCode: 'bad',
        newPassword: 'NewPass1!',
      }),
    ).rejects.toMatchObject({ code: 'CODE_MISMATCH' })
  })

  it('uses Amplify resetPassword when no test client override is set', async () => {
    vi.mocked(resetPassword).mockResolvedValue({} as never)
    await requestFanPasswordReset('fan@example.com')
    expect(resetPassword).toHaveBeenCalledWith({ username: 'fan@example.com' })
  })

  it('uses Amplify confirmResetPassword when no test client override is set', async () => {
    vi.mocked(confirmResetPassword).mockResolvedValue({} as never)
    await confirmFanPasswordReset({
      username: 'fan@example.com',
      confirmationCode: '123456',
      newPassword: 'NewPass1!',
    })
    expect(confirmResetPassword).toHaveBeenCalledWith({
      username: 'fan@example.com',
      confirmationCode: '123456',
      newPassword: 'NewPass1!',
    })
  })

  it('meetsFanPasswordPolicy enforces Cognito default rules', () => {
    expect(meetsFanPasswordPolicy('short1!')).toBe(false)
    expect(meetsFanPasswordPolicy('NewPass1!')).toBe(true)
  })

  it('signUpFan calls signUp and does not write tokens', async () => {
    const signUp = vi.fn().mockResolvedValue(undefined)
    setFanSrpClientForTests({
      signIn: vi.fn(),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
      signUp,
    })

    await signUpFan('fan@example.com', 'NewPass1!')
    expect(signUp).toHaveBeenCalledWith('fan@example.com', 'NewPass1!')
    expect(setFanTokenBundle).not.toHaveBeenCalled()
  })

  it('maps UsernameExists on signUp', async () => {
    setFanSrpClientForTests({
      signIn: vi.fn(),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn().mockRejectedValue(Object.assign(new Error('Exists'), { name: 'UsernameExistsException' })),
    })

    await expect(signUpFan('fan@example.com', 'NewPass1!')).rejects.toMatchObject({ code: 'USERNAME_EXISTS' })
  })

  it('confirmFanSignUp does not write tokens', async () => {
    const confirmSignUpMock = vi.fn().mockResolvedValue(undefined)
    setFanSrpClientForTests({
      signIn: vi.fn(),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
      confirmSignUp: confirmSignUpMock,
    })

    await confirmFanSignUp('fan@example.com', '123456')
    expect(confirmSignUpMock).toHaveBeenCalledWith('fan@example.com', '123456')
    expect(setFanTokenBundle).not.toHaveBeenCalled()
  })

  it('resendFanConfirmationCode calls resendSignUpCode', async () => {
    const resendMock = vi.fn().mockResolvedValue(undefined)
    setFanSrpClientForTests({
      signIn: vi.fn(),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
      resendSignUpCode: resendMock,
    })

    await resendFanConfirmationCode('fan@example.com')
    expect(resendMock).toHaveBeenCalledWith('fan@example.com')
  })

  it('uses Amplify signUp when no test client override is set', async () => {
    vi.mocked(amplifySignUp).mockResolvedValue({} as never)
    await signUpFan('fan@example.com', 'NewPass1!')
    expect(amplifySignUp).toHaveBeenCalledWith({
      username: 'fan@example.com',
      password: 'NewPass1!',
      options: { userAttributes: { email: 'fan@example.com' } },
    })
  })

  it('uses Amplify confirmSignUp when no test client override is set', async () => {
    vi.mocked(confirmSignUp).mockResolvedValue({} as never)
    await confirmFanSignUp('fan@example.com', '123456')
    expect(confirmSignUp).toHaveBeenCalledWith({
      username: 'fan@example.com',
      confirmationCode: '123456',
    })
  })

  it('uses Amplify resendSignUpCode when no test client override is set', async () => {
    vi.mocked(resendSignUpCode).mockResolvedValue({} as never)
    await resendFanConfirmationCode('fan@example.com')
    expect(resendSignUpCode).toHaveBeenCalledWith({ username: 'fan@example.com' })
  })

  it('does not write tokens on UNCONFIRMED sign-in path', async () => {
    setFanSrpClientForTests({
      signIn: vi.fn().mockResolvedValue({
        isSignedIn: false,
        nextStep: { signInStep: 'CONFIRM_SIGN_UP' },
      }),
      fetchSession: vi.fn(),
      signOut: vi.fn(),
    })

    await expect(signInWithSrp('fan@example.com', 'secret')).rejects.toMatchObject({ code: 'UNCONFIRMED' })
    expect(setFanTokenBundle).not.toHaveBeenCalled()
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
