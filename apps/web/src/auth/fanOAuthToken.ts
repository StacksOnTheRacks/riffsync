import {
  clearFanTokens,
  fanAccessExpiryEpochSec,
  getFanRefreshToken,
  getFanTokenBundle,
  setFanTokenBundle,
} from './fanTokens'

const PKCE_VERIFIER = 'riffsync.pkceVerifier'
const OAUTH_STATE = 'riffsync.oauthState'

const REFRESH_LEEWAY_SEC = 300

let refreshFanTokensInFlight: Promise<void> | null = null

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

/**
 * Uses Cognito **`refresh_token`** (stored after sign-in) to obtain a new **`access_token`**
 * before the current one expires. No-op without env, refresh token, or when access is still fresh.
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
