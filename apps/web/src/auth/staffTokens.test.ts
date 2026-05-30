// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearStaffTokens,
  getStaffAccessToken,
  getStaffRefreshToken,
  getStaffTokenBundle,
  setStaffTokenBundle,
} from './staffTokens'

/** Minimal JWT with exp claim (no signature verify in UI). */
function fakeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ sub: 'staff-1', exp }))
  return `${header}.${payload}.sig`
}

describe('staffTokens', () => {
  beforeEach(() => {
    clearStaffTokens()
  })

  afterEach(() => {
    clearStaffTokens()
  })

  it('set/get/clear round-trip', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const token = fakeJwt(exp)
    setStaffTokenBundle(token, 3600, { refreshToken: 'refresh-abc' })
    expect(getStaffTokenBundle()?.accessToken).toBe(token)
    expect(getStaffRefreshToken()).toBe('refresh-abc')
    expect(getStaffAccessToken()).toBeTruthy()
    clearStaffTokens()
    expect(getStaffTokenBundle()).toBeNull()
    expect(getStaffRefreshToken()).toBeNull()
    expect(getStaffAccessToken()).toBeNull()
  })

  it('returns null when access is within 30s of expiry', () => {
    const now = Math.floor(Date.now() / 1000)
    setStaffTokenBundle(fakeJwt(now + 20), 20)
    expect(getStaffAccessToken()).toBeNull()
  })

  it('uses JWT exp when stored expiry is missing', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem('riffsync.staffAccessToken', fakeJwt(exp))
    expect(getStaffAccessToken()).toBeTruthy()
  })
})
