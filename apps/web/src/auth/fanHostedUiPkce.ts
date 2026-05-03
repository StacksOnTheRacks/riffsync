import { setFanTokenBundle } from './fanTokens'

const PKCE_VERIFIER = 'riffsync.pkceVerifier'
const OAUTH_STATE = 'riffsync.oauthState'
const RETURN = 'riffsync.returnTo'

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

/**
 * PKCE + Cognito Hosted UI (Facebook IdP). Redirects the browser.
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
    identity_provider: 'Facebook',
  })

  const url = `https://${hostedDomain()}/oauth2/authorize?${params.toString()}`
  window.location.assign(url)
}

export function popReturnPath(): string {
  const p = sessionStorage.getItem(RETURN) ?? '/catalog'
  sessionStorage.removeItem(RETURN)
  return p
}

export async function exchangeFanAuthorizationCode(
  code: string,
  state: string,
): Promise<void> {
  const expectedState = sessionStorage.getItem(OAUTH_STATE)
  const verifier = sessionStorage.getItem(PKCE_VERIFIER)
  if (!expectedState || state !== expectedState) {
    throw new Error('OAuth state mismatch — try signing in again.')
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

  sessionStorage.removeItem(OAUTH_STATE)
  sessionStorage.removeItem(PKCE_VERIFIER)

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${t}`)
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new Error('Token response missing access_token / expires_in')
  }
  setFanTokenBundle(json.access_token, json.expires_in)
}
