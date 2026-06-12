import { jwtPayload } from '../../auth/jwtDecode'
import { SFU_JWT_REMINT_LEAD_SECONDS } from './drawerReconnectPolicy'

/** Milliseconds until proactive SFU join JWT re-mint should fire, or null when unknown. */
export function resolveJwtRemintDelayMs(
  token: string,
  expiresInSeconds?: number,
  nowMs = Date.now(),
): number | null {
  const payload = jwtPayload<{ exp?: unknown }>(token)
  if (typeof payload?.exp === 'number' && Number.isFinite(payload.exp)) {
    const fireAtMs = (payload.exp - SFU_JWT_REMINT_LEAD_SECONDS) * 1000
    return Math.max(0, fireAtMs - nowMs)
  }
  if (typeof expiresInSeconds === 'number' && Number.isFinite(expiresInSeconds)) {
    const leadMs = Math.max(0, expiresInSeconds - SFU_JWT_REMINT_LEAD_SECONDS) * 1000
    return leadMs
  }
  return null
}
