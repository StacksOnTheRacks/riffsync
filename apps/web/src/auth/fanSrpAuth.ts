import {
  confirmResetPassword,
  fetchAuthSession,
  resetPassword,
  signIn,
  signOut,
} from 'aws-amplify/auth'
import { ensureFanCognitoConfigured } from './fanCognitoConfig'
import { setFanTokenBundle } from './fanTokens'

export type FanAuthErrorCode =
  | 'UNCONFIRMED'
  | 'NEW_PASSWORD_REQUIRED'
  | 'NOT_AUTHORIZED'
  | 'INVALID_PARAMETER'
  | 'LIMIT_EXCEEDED'
  | 'CODE_DELIVERY'
  | 'CODE_MISMATCH'
  | 'EXPIRED_CODE'
  | 'INVALID_PASSWORD'
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

export interface FanConfirmPasswordResetInput {
  username: string
  confirmationCode: string
  newPassword: string
}

export interface FanSrpClient {
  signIn(username: string, password: string): Promise<{ isSignedIn: boolean; nextStep?: { signInStep?: string } }>
  fetchSession(): Promise<{
    accessToken?: string
    expiresIn?: number
    refreshToken?: string
  }>
  signOut(): Promise<void>
  resetPassword?(username: string): Promise<void>
  confirmResetPassword?(input: FanConfirmPasswordResetInput): Promise<void>
}

const FAN_RESET_USERNAME_KEY = 'riffsync.fanResetUsername'

let srpClientOverride: FanSrpClient | null = null

export function setFanSrpClientForTests(client: FanSrpClient | null): void {
  srpClientOverride = client
}

export function normalizeFanEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isFanEmailWellFormed(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeFanEmail(email))
}

/** Cognito default when pool passwordPolicy is unset. */
export function meetsFanPasswordPolicy(password: string): boolean {
  if (password.length < 8) return false
  if (!/[A-Z]/.test(password)) return false
  if (!/[a-z]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  if (!/[^A-Za-z0-9]/.test(password)) return false
  return true
}

export const FAN_PASSWORD_POLICY_HINT =
  'At least 8 characters with uppercase, lowercase, a number, and a symbol.'

async function defaultSignIn(username: string, password: string) {
  return signIn({
    username,
    password,
    options: { authFlowType: 'USER_SRP_AUTH' },
  })
}

function readRefreshToken(tokens: unknown): string | undefined {
  if (!tokens || typeof tokens !== 'object' || !('refreshToken' in tokens)) return undefined
  const refresh = (tokens as { refreshToken?: { toString(): string } }).refreshToken
  return refresh?.toString()
}

async function defaultFetchSession() {
  const session = await fetchAuthSession()
  const access = session.tokens?.accessToken
  const refresh = readRefreshToken(session.tokens)
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

async function defaultResetPassword(username: string): Promise<void> {
  await resetPassword({ username })
}

async function defaultConfirmResetPassword(input: FanConfirmPasswordResetInput): Promise<void> {
  await confirmResetPassword({
    username: input.username,
    confirmationCode: input.confirmationCode,
    newPassword: input.newPassword,
  })
}

function isNonEnumeratingForgotError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : ''
  return (
    name === 'UserNotFoundException' ||
    name === 'UserNotConfirmedException' ||
    name === 'InvalidParameterException'
  )
}

function mapForgotPasswordError(err: unknown): FanAuthError {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : 'Unable to send reset instructions.'

  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') {
    return new FanAuthError('LIMIT_EXCEEDED', 'Too many attempts. Please try again later.')
  }
  if (name === 'CodeDeliveryFailureException') {
    return new FanAuthError('CODE_DELIVERY', 'Unable to send reset instructions. Please try again later.')
  }
  if (message.includes('Missing fan Cognito SRP configuration')) {
    return new FanAuthError('CONFIG', message)
  }
  return new FanAuthError('UNKNOWN', 'Unable to send reset instructions. Please try again later.')
}

function mapConfirmResetError(err: unknown): FanAuthError {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : 'Unable to reset password.'

  if (name === 'CodeMismatchException') {
    return new FanAuthError('CODE_MISMATCH', 'The reset code is incorrect. Check your email and try again.')
  }
  if (name === 'ExpiredCodeException') {
    return new FanAuthError('EXPIRED_CODE', 'The reset code has expired. Request a new code and try again.')
  }
  if (name === 'InvalidPasswordException') {
    return new FanAuthError('INVALID_PASSWORD', FAN_PASSWORD_POLICY_HINT)
  }
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') {
    return new FanAuthError('LIMIT_EXCEEDED', 'Too many attempts. Please try again later.')
  }
  if (message.includes('Missing fan Cognito SRP configuration')) {
    return new FanAuthError('CONFIG', message)
  }
  return new FanAuthError('UNKNOWN', 'Unable to reset password. Please try again.')
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

function resolveClient(): FanSrpClient {
  return (
    srpClientOverride ?? {
      signIn: defaultSignIn,
      fetchSession: defaultFetchSession,
      signOut: () => signOut(),
      resetPassword: defaultResetPassword,
      confirmResetPassword: defaultConfirmResetPassword,
    }
  )
}

/** Non-enumerating: resolves for unknown emails as well as successful sends. */
export async function requestFanPasswordReset(rawEmail: string): Promise<void> {
  const username = normalizeFanEmail(rawEmail)
  if (!username || !isFanEmailWellFormed(username)) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter a valid email address.')
  }

  try {
    ensureFanCognitoConfigured()
  } catch (err) {
    throw mapForgotPasswordError(err)
  }

  const client = resolveClient()
  const reset = client.resetPassword ?? defaultResetPassword

  try {
    await reset(username)
    sessionStorage.setItem(FAN_RESET_USERNAME_KEY, username)
  } catch (err) {
    if (isNonEnumeratingForgotError(err)) {
      sessionStorage.setItem(FAN_RESET_USERNAME_KEY, username)
      return
    }
    throw mapForgotPasswordError(err)
  }
}

export async function confirmFanPasswordReset(input: FanConfirmPasswordResetInput): Promise<void> {
  const username = normalizeFanEmail(input.username)
  const confirmationCode = input.confirmationCode.trim()
  const newPassword = input.newPassword

  if (!username || !isFanEmailWellFormed(username)) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter a valid email address.')
  }
  if (!confirmationCode) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter the reset code from your email.')
  }
  if (!newPassword) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter a new password.')
  }
  if (!meetsFanPasswordPolicy(newPassword)) {
    throw new FanAuthError('INVALID_PASSWORD', FAN_PASSWORD_POLICY_HINT)
  }

  try {
    ensureFanCognitoConfigured()
  } catch (err) {
    throw mapConfirmResetError(err)
  }

  const client = resolveClient()
  const confirm = client.confirmResetPassword ?? defaultConfirmResetPassword

  try {
    await confirm({ username, confirmationCode, newPassword })
    sessionStorage.removeItem(FAN_RESET_USERNAME_KEY)
  } catch (err) {
    throw mapConfirmResetError(err)
  }
}

export function readFanResetUsernameFromSession(): string | null {
  return sessionStorage.getItem(FAN_RESET_USERNAME_KEY)
}

export async function signInWithSrp(username: string, password: string): Promise<FanSrpSignInResult> {
  try {
    ensureFanCognitoConfigured()
  } catch (err) {
    throw mapSignInError(err)
  }

  const client = resolveClient()

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
