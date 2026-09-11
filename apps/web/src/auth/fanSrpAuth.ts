import { fetchAuthSession, signIn, signOut } from 'aws-amplify/auth'
import { ensureFanCognitoConfigured } from './fanCognitoConfig'
import { setFanTokenBundle } from './fanTokens'

export type FanAuthErrorCode =
  | 'UNCONFIRMED'
  | 'NEW_PASSWORD_REQUIRED'
  | 'NOT_AUTHORIZED'
  | 'CONFIG'
  | 'UNKNOWN'

export class FanAuthError extends Error {
  readonly code: FanAuthErrorCode

  constructor(code: FanAuthErrorCode, message: string) {
    super(message)
    this.name = 'FanAuthError'
    this.code = code
  }
}

export interface FanSrpSignInResult {
  accessToken: string
  expiresIn: number
  refreshToken?: string
}

export interface FanSrpClient {
  signIn(username: string, password: string): Promise<{ isSignedIn: boolean; nextStep?: { signInStep?: string } }>
  fetchSession(): Promise<{
    accessToken?: string
    expiresIn?: number
    refreshToken?: string
  }>
  signOut(): Promise<void>
}

let srpClientOverride: FanSrpClient | null = null

export function setFanSrpClientForTests(client: FanSrpClient | null): void {
  srpClientOverride = client
}

async function defaultSignIn(username: string, password: string) {
  return signIn({
    username,
    password,
    options: { authFlowType: 'USER_SRP_AUTH' },
  })
}

async function defaultFetchSession() {
  const session = await fetchAuthSession()
  const access = session.tokens?.accessToken
  const refresh = session.tokens?.refreshToken?.toString()
  const exp = access?.payload?.exp
  const iat = access?.payload?.iat
  let expiresIn = 3600
  if (typeof exp === 'number' && typeof iat === 'number' && exp > iat) {
    expiresIn = exp - iat
  }
  return {
    accessToken: access?.toString(),
    expiresIn,
    refreshToken: refresh,
  }
}

function mapSignInError(err: unknown): FanAuthError {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : 'Sign-in failed'

  if (name === 'UserNotConfirmedException') {
    return new FanAuthError('UNCONFIRMED', message)
  }
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') {
    return new FanAuthError('NOT_AUTHORIZED', message)
  }
  if (message.includes('Missing fan Cognito SRP configuration')) {
    return new FanAuthError('CONFIG', message)
  }
  return new FanAuthError('UNKNOWN', message)
}

export async function signInWithSrp(username: string, password: string): Promise<FanSrpSignInResult> {
  try {
    ensureFanCognitoConfigured()
  } catch (err) {
    throw mapSignInError(err)
  }

  const client: FanSrpClient = srpClientOverride ?? {
    signIn: defaultSignIn,
    fetchSession: defaultFetchSession,
    signOut: () => signOut(),
  }

  try {
    const result = await client.signIn(username, password)
    const nextStep = result.nextStep?.signInStep
    if (nextStep === 'CONFIRM_SIGN_UP') {
      throw new FanAuthError('UNCONFIRMED', 'Email address is not verified.')
    }
    if (nextStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' || nextStep === 'NEW_PASSWORD_REQUIRED') {
      throw new FanAuthError('NEW_PASSWORD_REQUIRED', 'A new password is required before sign-in can complete.')
    }
    if (!result.isSignedIn) {
      throw new FanAuthError('UNKNOWN', 'Sign-in did not complete.')
    }

    const session = await client.fetchSession()
    if (!session.accessToken || typeof session.expiresIn !== 'number') {
      throw new FanAuthError('UNKNOWN', 'Sign-in succeeded but tokens were missing.')
    }

    setFanTokenBundle(session.accessToken, session.expiresIn, {
      ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    })

    await client.signOut()

    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    }
  } catch (err) {
    if (err instanceof FanAuthError) throw err
    throw mapSignInError(err)
  }
}
