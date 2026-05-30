import {
  clearStaffTokens,
  getStaffRefreshToken,
  getStaffTokenBundle,
  setStaffTokenBundle,
  staffAccessExpiryEpochSec,
} from './staffTokens'

const PKCE_VERIFIER = 'riffsync.staff.pkceVerifier'
const OAUTH_STATE = 'riffsync.staff.oauthState'
const RETURN = 'riffsync.staff.returnTo'

const DEFAULT_RETURN = '/admin'

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
  const d = import.meta.env.VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN?.trim()
  if (!d) throw new Error('Missing VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN')
  return d.replace(/^https?:\/\//, '')
}

function clientId(): string {
  const c = import.meta.env.VITE_STAFF_COGNITO_CLIENT_ID?.trim()
  if (!c) throw new Error('Missing VITE_STAFF_COGNITO_CLIENT_ID')
  return c
}

function redirectUri(): string {
  return `${window.location.origin}/admin/auth/callback`
}

/** Paths under `/admin` suitable for post-login redirect (excludes auth handoff routes). */
export function isStaffReturnPathAllowed(path: string): boolean {
  if (!path.startsWith('/admin')) return false
  if (path.startsWith('/admin/auth/callback')) return false
  if (path === '/admin/login' || path.startsWith('/admin/login?')) return false
  return true
}

export function normalizeStaffReturnPath(path: string | null | undefined): string {
  if (path && isStaffReturnPathAllowed(path)) return path
  return DEFAULT_RETURN
}

export async function startStaffHostedUiSignIn(returnPath: string): Promise<void> {
  const verifier = randomString(64)
  const challenge = await base64urlSha256(verifier)
  const state = randomString(32)
  sessionStorage.setItem(PKCE_VERIFIER, verifier)
  sessionStorage.setItem(OAUTH_STATE, state)
  sessionStorage.setItem(RETURN, normalizeStaffReturnPath(returnPath))

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

export function popStaffReturnPath(): string {
  const p = sessionStorage.getItem(RETURN)
  sessionStorage.removeItem(RETURN)
  return normalizeStaffReturnPath(p)
}

export async function exchangeStaffAuthorizationCode(
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

  const json = (await res.json()) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
  }
  if (!json.access_token || typeof json.expires_in !== 'number') {
    throw new Error('Token response missing access_token / expires_in')
  }
  setStaffTokenBundle(json.access_token, json.expires_in, {
    ...(typeof json.refresh_token === 'string' && json.refresh_token.length > 0
      ? { refreshToken: json.refresh_token }
      : {}),
  })
}

export const REFRESH_LEEWAY_SEC = 300

let refreshStaffTokensInFlight: Promise<void> | null = null

export function refreshStaffTokensIfStale(): Promise<void> {
  if (refreshStaffTokensInFlight) return refreshStaffTokensInFlight
  refreshStaffTokensInFlight = refreshStaffTokensIfStaleBody().finally(() => {
    refreshStaffTokensInFlight = null
  })
  return refreshStaffTokensInFlight
}

async function refreshStaffTokensIfStaleBody(): Promise<void> {
  const domainRaw = import.meta.env.VITE_STAFF_COGNITO_HOSTED_UI_DOMAIN?.trim()
  const cid = import.meta.env.VITE_STAFF_COGNITO_CLIENT_ID?.trim()
  if (!domainRaw || !cid) return

  const rt = getStaffRefreshToken()
  if (!rt) return

  const domain = domainRaw.replace(/^https?:\/\//, '')
  const bundle = getStaffTokenBundle()
  const now = Math.floor(Date.now() / 1000)
  const exp = bundle ? staffAccessExpiryEpochSec(bundle) : null

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
      if (res.status === 400 || res.status === 401) clearStaffTokens()
      return
    }

    const refreshed = (await res.json()) as {
      access_token?: string
      expires_in?: number
      refresh_token?: string
    }
    if (!refreshed.access_token || typeof refreshed.expires_in !== 'number') {
      clearStaffTokens()
      return
    }

    setStaffTokenBundle(refreshed.access_token, refreshed.expires_in, {
      ...(typeof refreshed.refresh_token === 'string' && refreshed.refresh_token.length > 0
        ? { refreshToken: refreshed.refresh_token }
        : {}),
    })
  } catch {
    /* Network blip — retain tokens; interval / visibility will retry. */
  }
}
