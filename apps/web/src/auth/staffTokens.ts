import { jwtPayload } from './jwtDecode'

const LS_ACCESS = 'riffsync.staffAccessToken'
const LS_EXPIRES = 'riffsync.staffAccessTokenExp'
const LS_REFRESH = 'riffsync.staffRefreshToken'

export interface StaffTokenBundle {
  accessToken: string
  /** Epoch seconds (Cognito `exp` claim rounded / server `expires_in`). */
  expiresAtSec: number
}

function resolvedExpiresAtSec(accessToken: string, storedExpirySec: number): number | null {
  const storedOk = Number.isFinite(storedExpirySec) && storedExpirySec > 0 ? storedExpirySec : 0
  const expClaim = jwtPayload<{ exp?: unknown }>(accessToken)?.exp
  const jwtOk = typeof expClaim === 'number' && Number.isFinite(expClaim) && expClaim > 0 ? expClaim : 0
  if (storedOk && jwtOk) return Math.min(storedOk, jwtOk)
  if (jwtOk) return jwtOk
  if (storedOk) return storedOk
  return null
}

export function staffAccessExpiryEpochSec(bundle: StaffTokenBundle): number | null {
  return resolvedExpiresAtSec(bundle.accessToken, bundle.expiresAtSec)
}

export function getStaffRefreshToken(): string | null {
  const t = localStorage.getItem(LS_REFRESH)
  return t && t.length > 0 ? t : null
}

export function getStaffTokenBundle(): StaffTokenBundle | null {
  const accessToken = localStorage.getItem(LS_ACCESS)
  const expRaw = localStorage.getItem(LS_EXPIRES)
  if (!accessToken) return null
  const expiresAtSec = expRaw ? Number.parseInt(expRaw, 10) : 0
  if (!Number.isFinite(expiresAtSec) || expiresAtSec <= 0) return { accessToken, expiresAtSec: 0 }
  return { accessToken, expiresAtSec }
}

export function getStaffAccessToken(): string | null {
  const b = getStaffTokenBundle()
  if (!b) return null
  const exp = resolvedExpiresAtSec(b.accessToken, b.expiresAtSec)
  if (!exp) return null
  const now = Math.floor(Date.now() / 1000)
  if (now >= exp - 30) return null
  return b.accessToken
}

export function setStaffTokenBundle(
  accessToken: string,
  expiresInSec: number,
  opts?: { refreshToken?: string },
): void {
  const now = Math.floor(Date.now() / 1000)
  localStorage.setItem(LS_ACCESS, accessToken)
  localStorage.setItem(LS_EXPIRES, String(now + expiresInSec))
  if (opts?.refreshToken !== undefined && opts.refreshToken.length > 0) {
    localStorage.setItem(LS_REFRESH, opts.refreshToken)
  }
}

export function clearStaffTokens(): void {
  localStorage.removeItem(LS_ACCESS)
  localStorage.removeItem(LS_EXPIRES)
  localStorage.removeItem(LS_REFRESH)
}
