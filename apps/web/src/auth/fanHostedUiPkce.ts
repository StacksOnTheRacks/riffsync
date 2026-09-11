import { persistReturnTo, popReturnTo } from './fanAuthNavigation'
import { exchangeFanAuthorizationCode, refreshFanTokensIfStale } from './fanOAuthToken'
import { clearFanTokens } from './fanTokens'

export { exchangeFanAuthorizationCode, refreshFanTokensIfStale } from './fanOAuthToken'

const PKCE_VERIFIER = 'riffsync.pkceVerifier'
const OAUTH_STATE = 'riffsync.oauthState'
const PASSWORD_RESET_FLOW = 'riffsync.passwordResetFlow'

function clearAuthCallbackSession(): void {
  sessionStorage.removeItem(OAUTH_STATE)
  sessionStorage.removeItem(PKCE_VERIFIER)
  sessionStorage.removeItem(PASSWORD_RESET_FLOW)
}

function randomString(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let s = ''
  for (let i = 0; i < len; i++) {
    s += chars[bytes[i]! % chars.length]!
  }
  return s
}

async function base64urlSha256(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hash)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function hostedDomain(): string {
  const d = import.meta.env.VITE_COGNITO_HOSTED_UI_DOMAIN?.trim()
  if (!d) throw new Error('Missing VITE_COGNITO_HOSTED_UI_DOMAIN')
  return d.replace(/^https?:\/\//, '')
}

function clientId(): string {
  const c = import.meta.env.VITE_COGNITO_CLIENT_ID?.trim()
  if (!c) throw new Error('Missing VITE_COGNITO_CLIENT_ID')
  return c
}

function redirectUri(): string {
  return `${window.location.origin}/auth/callback`
}

function defaultLogoutUri(): string {
  return `${window.location.origin}/`
}

/**
 * PKCE + Cognito Hosted UI (local user pool sign-in / sign-up). Redirects the browser.
 */
export async function startFanHostedUiSignIn(returnPath: string): Promise<void> {
  const verifier = randomString(64)
  const challenge = await base64urlSha256(verifier)
  const state = randomString(32)
  sessionStorage.setItem(PKCE_VERIFIER, verifier)
  sessionStorage.setItem(OAUTH_STATE, state)
  persistReturnTo(returnPath)

  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  const url = `https://${hostedDomain()}/oauth2/authorize?${params.toString()}`
  window.location.assign(url)
}

/**
 * Cognito Hosted UI forgot-password flow. After reset, the user returns through
 * `/auth/callback` and is sent to `returnPath` (default `/account`).
 */
export async function startFanHostedUiForgotPassword(returnPath = '/account'): Promise<void> {
  const verifier = randomString(64)
  const challenge = await base64urlSha256(verifier)
  const state = randomString(32)
  sessionStorage.setItem(PKCE_VERIFIER, verifier)
  sessionStorage.setItem(OAUTH_STATE, state)
  persistReturnTo(returnPath)
  sessionStorage.setItem(PASSWORD_RESET_FLOW, '1')

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  window.location.assign(`https://${hostedDomain()}/forgotPassword?${params.toString()}`)
}

/** Clears local fan tokens and ends the Cognito Hosted UI browser session. */
export function startFanHostedUiSignOut(logoutUri = defaultLogoutUri()): void {
  clearFanTokens()
  const params = new URLSearchParams({
    client_id: clientId(),
    logout_uri: logoutUri,
  })
  window.location.assign(`https://${hostedDomain()}/logout?${params.toString()}`)
}

export function popReturnPath(): string {
  return popReturnTo()
}

function appendPasswordResetQuery(path: string): string {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('passwordReset', '1')
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Finish Hosted UI redirect at `/auth/callback` for sign-in or forgot-password.
 */
export async function completeFanAuthCallback(
  code: string,
  state?: string | null,
): Promise<{ nextPath: string }> {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER)
  const passwordResetFlow = sessionStorage.getItem(PASSWORD_RESET_FLOW) === '1'
  const storedReturn = sessionStorage.getItem('riffsync.returnTo')

  if (verifier) {
    await exchangeFanAuthorizationCode(code, state)
    clearAuthCallbackSession()
    const nextPath = popReturnTo()
    return {
      nextPath: passwordResetFlow ? appendPasswordResetQuery(nextPath) : nextPath,
    }
  }

  if (passwordResetFlow || (!state && storedReturn)) {
    const nextPath = popReturnTo()
    clearAuthCallbackSession()
    return { nextPath: appendPasswordResetQuery(nextPath) }
  }

  if (!state) {
    throw new Error('Missing OAuth state — try signing in again.')
  }

  await exchangeFanAuthorizationCode(code, state)
  clearAuthCallbackSession()
  return { nextPath: popReturnTo() }
}
