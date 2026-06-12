import { describe, expect, it } from 'vitest'
import { SFU_JWT_REMINT_LEAD_SECONDS } from './drawerReconnectPolicy'
import { resolveJwtRemintDelayMs } from './sfuJwtRemintSchedule'

function base64UrlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `header.${base64UrlJson(payload)}.sig`
}

describe('resolveJwtRemintDelayMs', () => {
  it('schedules remint at exp minus lead seconds', () => {
    const nowMs = 1_700_000_000_000
    const exp = Math.floor(nowMs / 1000) + 900
    const token = fakeJwt({ exp })
    const delay = resolveJwtRemintDelayMs(token, undefined, nowMs)
    expect(delay).toBe((900 - SFU_JWT_REMINT_LEAD_SECONDS) * 1000)
  })

  it('falls back to expiresInSeconds when JWT exp is missing', () => {
    const token = fakeJwt({ sub: 'sess' })
    expect(resolveJwtRemintDelayMs(token, 900)).toBe((900 - SFU_JWT_REMINT_LEAD_SECONDS) * 1000)
  })

  it('returns null when neither exp nor expiresInSeconds is available', () => {
    const token = fakeJwt({ sub: 'sess' })
    expect(resolveJwtRemintDelayMs(token)).toBeNull()
  })
})
