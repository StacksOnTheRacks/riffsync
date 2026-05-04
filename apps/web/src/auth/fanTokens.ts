import { jwtPayload } from './jwtDecode'

const LS_ACCESS = 'riffsync.fanAccessToken'
const LS_EXPIRES = 'riffsync.fanAccessTokenExp'

export interface FanTokenBundle {
  accessToken: string
  /** Epoch seconds (Cognito `exp` claim rounded / server `expires_in`). */
  expiresAtSec: number
}

/** Earliest plausible expiry — aligns UI with Lambda `verifyAccessToken`, which rejects expired JWTs even when LS expiry is missing. */
function resolvedExpiresAtSec(accessToken: string, storedExpirySec: number): number | null {
  const storedOk = Number.isFinite(storedExpirySec) && storedExpirySec > 0 ? storedExpirySec : 0
  const expClaim = jwtPayload<{ exp?: unknown }>(accessToken)?.exp
  const jwtOk = typeof expClaim === 'number' && Number.isFinite(expClaim) && expClaim > 0 ? expClaim : 0
  if (storedOk && jwtOk) return Math.min(storedOk, jwtOk)
  if (jwtOk) return jwtOk
  if (storedOk) return storedOk
  return null
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
  const exp = resolvedExpiresAtSec(b.accessToken, b.expiresAtSec)
  if (!exp) return null
  const now = Math.floor(Date.now() / 1000)
  if (now >= exp - 30) return null
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
