import {
  clearFanTokens,
  getFanRefreshToken,
  getFanTokenBundle,
  setFanTokenBundle,
  fanAccessExpiryEpochSec,
} from './fanTokens'

const PKCE_VERIFIER = 'riffsync.pkceVerifier'
const OAUTH_STATE = 'riffsync.oauthState'
const RETURN = 'riffsync.returnTo'
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
  sessionStorage.setItem(RETURN, returnPath)

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
 *
 * PKCE + state are stored like sign-in. Cognito may omit `state` on the callback even
 * when it was sent; `/auth/callback` handles code-only returns for this flow.
 */
export async function startFanHostedUiForgotPassword(returnPath = '/account'): Promise<void> {
  const verifier = randomString(64)
  const challenge = await base64urlSha256(verifier)
  const state = randomString(32)
  sessionStorage.setItem(PKCE_VERIFIER, verifier)
  sessionStorage.setItem(OAUTH_STATE, state)
  sessionStorage.setItem(RETURN, returnPath)
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
  const p = sessionStorage.getItem(RETURN) ?? '/catalog'
  sessionStorage.removeItem(RETURN)
  return p
}

function appendPasswordResetQuery(path: string): string {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('passwordReset', '1')
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Finish Hosted UI redirect at `/auth/callback` for sign-in or forgot-password.
 * Password reset may return `code` without `state`; exchange uses PKCE when present.
 */
export async function completeFanAuthCallback(
  code: string,
  state?: string | null,
): Promise<{ nextPath: string }> {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER)
  const passwordResetFlow = sessionStorage.getItem(PASSWORD_RESET_FLOW) === '1'
  const storedReturn = sessionStorage.getItem(RETURN)

  if (verifier) {
    await exchangeFanAuthorizationCode(code, state)
    clearAuthCallbackSession()
    const nextPath = popReturnPath()
    return {
      nextPath: passwordResetFlow ? appendPasswordResetQuery(nextPath) : nextPath,
    }
  }

  if (passwordResetFlow || (!state && storedReturn)) {
    const nextPath = popReturnPath()
    clearAuthCallbackSession()
    return { nextPath: appendPasswordResetQuery(nextPath) }
  }

  if (!state) {
    throw new Error('Missing OAuth state — try signing in again.')
  }

  await exchangeFanAuthorizationCode(code, state)
  clearAuthCallbackSession()
  return { nextPath: popReturnPath() }
}

export async function exchangeFanAuthorizationCode(
  code: string,
  state?: string | null,
): Promise<void> {
  const expectedState = sessionStorage.getItem(OAUTH_STATE)
  const verifier = sessionStorage.getItem(PKCE_VERIFIER)
  if (state != null && state !== '') {
    if (!expectedState || state !== expectedState) {
      throw new Error('OAuth state mismatch — try signing in again.')
    }
  }
  if (!verifier) {
    throw new Error('Missing PKCE verifier — try signing in again.')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId(),
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  })

  const res = await fetch(`https://${hostedDomain()}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${t}`)
  }

  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
  }
  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new Error('Token response missing access_token / expires_in')
  }
  setFanTokenBundle(json.access_token, json.expires_in, {
    ...(typeof json.refresh_token === 'string' && json.refresh_token.length > 0
      ? { refreshToken: json.refresh_token }
      : {}),
  })
}

const REFRESH_LEEWAY_SEC = 300

let refreshFanTokensInFlight: Promise<void> | null = null

/**
 * Uses Cognito **`refresh_token`** (stored after sign-in) to obtain a new **`access_token`**
 * before the current one expires. No-op without env, refresh token, or when access is still fresh.
 *
 * Requires the User Pool app client to issue refresh tokens (non-zero refresh token expiry in Cognito).
 */
export function refreshFanTokensIfStale(): Promise<void> {
  if (refreshFanTokensInFlight) return refreshFanTokensInFlight
  refreshFanTokensInFlight = refreshFanTokensIfStaleBody().finally(() => {
    refreshFanTokensInFlight = null
  })
  return refreshFanTokensInFlight
}

async function refreshFanTokensIfStaleBody(): Promise<void> {
  const domainRaw = import.meta.env.VITE_COGNITO_HOSTED_UI_DOMAIN?.trim()
  const cid = import.meta.env.VITE_COGNITO_CLIENT_ID?.trim()
  if (!domainRaw || !cid) return

  const rt = getFanRefreshToken()
  if (!rt) return

  const domain = domainRaw.replace(/^https?:\/\//, '')
  const bundle = getFanTokenBundle()
  const now = Math.floor(Date.now() / 1000)
  const exp = bundle ? fanAccessExpiryEpochSec(bundle) : null

  const needsRefresh = exp === null || now >= exp - REFRESH_LEEWAY_SEC || now >= exp - 30
  if (!needsRefresh) return

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cid,
    refresh_token: rt,
  })

  try {
    const res = await fetch(`https://${domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!res.ok) {
      if (res.status === 400 || res.status === 401) clearFanTokens()
      return
    }

    const refreshed = (await res.json()) as {
      access_token?: string
      expires_in?: number
      refresh_token?: string
    }
    if (!refreshed.access_token || typeof refreshed.expires_in !== 'number') {
      clearFanTokens()
      return
    }

    setFanTokenBundle(refreshed.access_token, refreshed.expires_in, {
      ...(typeof refreshed.refresh_token === 'string' && refreshed.refresh_token.length > 0
        ? { refreshToken: refreshed.refresh_token }
        : {}),
    })
  } catch {
    /* Network blip — retain tokens; interval / visibility will retry. */
  }
}
