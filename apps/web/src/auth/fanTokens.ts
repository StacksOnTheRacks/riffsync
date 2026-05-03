const LS_ACCESS = 'riffsync.fanAccessToken'
const LS_EXPIRES = 'riffsync.fanAccessTokenExp'

export interface FanTokenBundle {
  accessToken: string
  /** Epoch seconds (Cognito `exp` claim rounded / server `expires_in`). */
  expiresAtSec: number
}

export function getFanTokenBundle(): FanTokenBundle | null {
  const accessToken = localStorage.getItem(LS_ACCESS)
  const expRaw = localStorage.getItem(LS_EXPIRES)
  if (!accessToken) return null
  const expiresAtSec = expRaw ? Number.parseInt(expRaw, 10) : 0
  if (!Number.isFinite(expiresAtSec) || expiresAtSec <= 0) return { accessToken, expiresAtSec: 0 }
  return { accessToken, expiresAtSec }
}

export function getFanAccessToken(): string | null {
  const b = getFanTokenBundle()
  if (!b) return null
  const now = Math.floor(Date.now() / 1000)
  if (b.expiresAtSec && now >= b.expiresAtSec - 30) {
    return null
  }
  return b.accessToken
}

export function setFanTokenBundle(accessToken: string, expiresInSec: number): void {
  const now = Math.floor(Date.now() / 1000)
  localStorage.setItem(LS_ACCESS, accessToken)
  localStorage.setItem(LS_EXPIRES, String(now + expiresInSec))
}

export function clearFanTokens(): void {
  localStorage.removeItem(LS_ACCESS)
  localStorage.removeItem(LS_EXPIRES)
}
