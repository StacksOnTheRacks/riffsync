import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth'
import { ensureFanCognitoConfigured, readFanCognitoEnv } from './fanCognitoConfig'
import { refreshFanTokensIfStale } from './fanOAuthToken'
import { getFanAccessToken, setFanTokenBundle } from './fanTokens'

export type FanAuthErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNCONFIRMED'
  | 'NEW_PASSWORD_REQUIRED'
  | 'NOT_AUTHORIZED'
  | 'INVALID_PARAMETER'
  | 'LIMIT_EXCEEDED'
  | 'CODE_DELIVERY'
  | 'CODE_MISMATCH'
  | 'EXPIRED_CODE'
  | 'INVALID_PASSWORD'
  | 'USERNAME_EXISTS'
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

export interface FanChangePasswordInput {
  accessToken: string
  previousPassword: string
  proposedPassword: string
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
  signUp?(username: string, password: string): Promise<void>
  confirmSignUp?(username: string, confirmationCode: string): Promise<void>
  resendSignUpCode?(username: string): Promise<void>
  changePassword?(input: FanChangePasswordInput): Promise<void>
}

const FAN_RESET_USERNAME_KEY = 'riffsync.fanResetUsername'
const FAN_VERIFY_USERNAME_KEY = 'riffsync.fanVerifyUsername'

export const FAN_SIGN_IN_GENERIC_ERROR = 'Incorrect email or password.'
export const FAN_USERNAME_EXISTS_ERROR =
  'An account with this email already exists. Sign in or verify your email if you still need access.'
export const FAN_NEW_PASSWORD_REQUIRED_ERROR =
  'A new password is required before sign-in can complete. Contact support or use forgot password if you need help.'

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

async function defaultSignUp(username: string, password: string): Promise<void> {
  await signUp({
    username,
    password,
    options: { userAttributes: { email: username } },
  })
}

async function defaultConfirmSignUp(username: string, confirmationCode: string): Promise<void> {
  await confirmSignUp({ username, confirmationCode })
}

async function defaultResendSignUpCode(username: string): Promise<void> {
  await resendSignUpCode({ username })
}

function cognitoIdpRegion(): string | null {
  const env = readFanCognitoEnv()
  return env?.region ?? null
}

async function defaultChangePassword(input: FanChangePasswordInput): Promise<void> {
  const region = cognitoIdpRegion()
  if (!region) {
    throw new FanAuthError(
      'CONFIG',
      'Missing fan Cognito SRP configuration (VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_CLIENT_ID, VITE_COGNITO_REGION)',
    )
  }

  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.ChangePassword',
    },
    body: JSON.stringify({
      AccessToken: input.accessToken,
      PreviousPassword: input.previousPassword,
      ProposedPassword: input.proposedPassword,
    }),
  })

  if (res.ok) return

  let errType = ''
  let message = 'Unable to change password.'
  try {
    const json = (await res.json()) as { __type?: string; message?: string }
    errType = typeof json.__type === 'string' ? json.__type : ''
    if (typeof json.message === 'string' && json.message.length > 0) message = json.message
  } catch {
    /* use defaults */
  }

  throw Object.assign(new Error(message), { name: errType.split('#').pop() ?? 'UnknownException' })
}

function isTokenShapedNotAuthorized(message: string): boolean {
  return message.toLowerCase().includes('access token')
}

function mapChangePasswordError(err: unknown): FanAuthError {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : 'Unable to change password.'

  if (name === 'NotAuthorizedException') {
    if (isTokenShapedNotAuthorized(message)) {
      return new FanAuthError('UNAUTHENTICATED', message)
    }
    return new FanAuthError('NOT_AUTHORIZED', 'Current password is incorrect.')
  }
  if (name === 'InvalidPasswordException') {
    return new FanAuthError('INVALID_PASSWORD', FAN_PASSWORD_POLICY_HINT)
  }
  if (name === 'InvalidParameterException') {
    return new FanAuthError('INVALID_PARAMETER', message)
  }
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') {
    return new FanAuthError('LIMIT_EXCEEDED', 'Too many attempts. Please try again later.')
  }
  if (message.includes('Missing fan Cognito SRP configuration')) {
    return new FanAuthError('CONFIG', message)
  }
  return new FanAuthError('UNKNOWN', 'Unable to change password. Please try again.')
}

async function resolveFanAccessTokenForChange(): Promise<string> {
  let token = getFanAccessToken()
  if (token) return token

  await refreshFanTokensIfStale()
  token = getFanAccessToken()
  if (!token) {
    throw new FanAuthError('UNAUTHENTICATED', 'Sign in to change your password.')
  }
  return token
}

async function invokeChangePassword(
  client: FanSrpClient,
  accessToken: string,
  previousPassword: string,
  proposedPassword: string,
): Promise<void> {
  const change = client.changePassword ?? defaultChangePassword
  await change({
    accessToken,
    previousPassword,
    proposedPassword,
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
    return new FanAuthError('NOT_AUTHORIZED', FAN_SIGN_IN_GENERIC_ERROR)
  }
  if (message.includes('Missing fan Cognito SRP configuration')) {
    return new FanAuthError('CONFIG', message)
  }
  return new FanAuthError('UNKNOWN', message)
}

function mapSignUpError(err: unknown): FanAuthError {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : 'Unable to create account.'

  if (name === 'UsernameExistsException' || name === 'AliasExistsException') {
    return new FanAuthError('USERNAME_EXISTS', FAN_USERNAME_EXISTS_ERROR)
  }
  if (name === 'InvalidPasswordException') {
    return new FanAuthError('INVALID_PASSWORD', FAN_PASSWORD_POLICY_HINT)
  }
  if (name === 'InvalidParameterException') {
    return new FanAuthError('INVALID_PARAMETER', message)
  }
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') {
    return new FanAuthError('LIMIT_EXCEEDED', 'Too many attempts. Please try again later.')
  }
  if (message.includes('Missing fan Cognito SRP configuration')) {
    return new FanAuthError('CONFIG', message)
  }
  return new FanAuthError('UNKNOWN', 'Unable to create account. Please try again.')
}

function mapConfirmSignUpError(err: unknown): FanAuthError {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : 'Unable to verify email.'

  if (name === 'CodeMismatchException') {
    return new FanAuthError('CODE_MISMATCH', 'The verification code is incorrect. Check your email and try again.')
  }
  if (name === 'ExpiredCodeException') {
    return new FanAuthError('EXPIRED_CODE', 'The verification code has expired. Request a new code and try again.')
  }
  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') {
    return new FanAuthError('LIMIT_EXCEEDED', 'Too many attempts. Please try again later.')
  }
  if (message.includes('Missing fan Cognito SRP configuration')) {
    return new FanAuthError('CONFIG', message)
  }
  return new FanAuthError('UNKNOWN', 'Unable to verify email. Please try again.')
}

function mapResendSignUpError(err: unknown): FanAuthError {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : 'Unable to resend verification code.'

  if (name === 'LimitExceededException' || name === 'TooManyRequestsException') {
    return new FanAuthError('LIMIT_EXCEEDED', 'Too many attempts. Please try again later.')
  }
  if (name === 'CodeDeliveryFailureException') {
    return new FanAuthError('CODE_DELIVERY', 'Unable to resend the verification code. Please try again later.')
  }
  if (message.includes('Missing fan Cognito SRP configuration')) {
    return new FanAuthError('CONFIG', message)
  }
  return new FanAuthError('UNKNOWN', 'Unable to resend the verification code. Please try again later.')
}

function resolveClient(): FanSrpClient {
  return (
    srpClientOverride ?? {
      signIn: defaultSignIn,
      fetchSession: defaultFetchSession,
      signOut: () => signOut(),
      resetPassword: defaultResetPassword,
      confirmResetPassword: defaultConfirmResetPassword,
      signUp: defaultSignUp,
      confirmSignUp: defaultConfirmSignUp,
      resendSignUpCode: defaultResendSignUpCode,
      changePassword: defaultChangePassword,
    }
  )
}

export async function changePassword(previousPassword: string, proposedPassword: string): Promise<void> {
  if (!previousPassword) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter your current password.')
  }
  if (!proposedPassword) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter a new password.')
  }
  if (!meetsFanPasswordPolicy(proposedPassword)) {
    throw new FanAuthError('INVALID_PASSWORD', FAN_PASSWORD_POLICY_HINT)
  }

  try {
    ensureFanCognitoConfigured()
  } catch (err) {
    throw mapChangePasswordError(err)
  }

  const client = resolveClient()
  const accessToken = await resolveFanAccessTokenForChange()

  try {
    await invokeChangePassword(client, accessToken, previousPassword, proposedPassword)
  } catch (err) {
    if (err instanceof FanAuthError) throw err

    const mapped = mapChangePasswordError(err)
    if (mapped.code !== 'UNAUTHENTICATED') throw mapped

    await refreshFanTokensIfStale()
    const refreshedToken = getFanAccessToken()
    if (!refreshedToken) throw mapped

    try {
      await invokeChangePassword(client, refreshedToken, previousPassword, proposedPassword)
    } catch (retryErr) {
      if (retryErr instanceof FanAuthError) throw retryErr
      const retryMapped = mapChangePasswordError(retryErr)
      if (retryMapped.code === 'UNAUTHENTICATED') throw retryMapped
      throw retryMapped
    }
  }
}

export function writeFanVerifyUsername(rawEmail: string): void {
  sessionStorage.setItem(FAN_VERIFY_USERNAME_KEY, normalizeFanEmail(rawEmail))
}

export function readFanVerifyUsernameFromSession(): string | null {
  return sessionStorage.getItem(FAN_VERIFY_USERNAME_KEY)
}

export function clearFanVerifyUsername(): void {
  sessionStorage.removeItem(FAN_VERIFY_USERNAME_KEY)
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
      throw new FanAuthError('NEW_PASSWORD_REQUIRED', FAN_NEW_PASSWORD_REQUIRED_ERROR)
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

export async function signUpFan(rawEmail: string, password: string): Promise<void> {
  const username = normalizeFanEmail(rawEmail)
  if (!username || !isFanEmailWellFormed(username)) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter a valid email address.')
  }
  if (!password) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter a password.')
  }
  if (!meetsFanPasswordPolicy(password)) {
    throw new FanAuthError('INVALID_PASSWORD', FAN_PASSWORD_POLICY_HINT)
  }

  try {
    ensureFanCognitoConfigured()
  } catch (err) {
    throw mapSignUpError(err)
  }

  const client = resolveClient()
  const register = client.signUp ?? defaultSignUp

  try {
    await register(username, password)
  } catch (err) {
    throw mapSignUpError(err)
  }
}

export async function confirmFanSignUp(rawEmail: string, confirmationCode: string): Promise<void> {
  const username = normalizeFanEmail(rawEmail)
  const code = confirmationCode.trim()

  if (!username || !isFanEmailWellFormed(username)) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter a valid email address.')
  }
  if (!code) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter the verification code from your email.')
  }

  try {
    ensureFanCognitoConfigured()
  } catch (err) {
    throw mapConfirmSignUpError(err)
  }

  const client = resolveClient()
  const confirm = client.confirmSignUp ?? defaultConfirmSignUp

  try {
    await confirm(username, code)
  } catch (err) {
    throw mapConfirmSignUpError(err)
  }
}

export async function resendFanConfirmationCode(rawEmail: string): Promise<void> {
  const username = normalizeFanEmail(rawEmail)
  if (!username || !isFanEmailWellFormed(username)) {
    throw new FanAuthError('INVALID_PARAMETER', 'Enter a valid email address.')
  }

  try {
    ensureFanCognitoConfigured()
  } catch (err) {
    throw mapResendSignUpError(err)
  }

  const client = resolveClient()
  const resend = client.resendSignUpCode ?? defaultResendSignUpCode

  try {
    await resend(username)
  } catch (err) {
    throw mapResendSignUpError(err)
  }
}
