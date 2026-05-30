// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isStaffReturnPathAllowed,
  normalizeStaffReturnPath,
  popStaffReturnPath,
} from './staffHostedUiPkce'

describe('staffHostedUiPkce return paths', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('allowlists /admin paths except auth handoff routes', () => {
    expect(isStaffReturnPathAllowed('/admin')).toBe(true)
    expect(isStaffReturnPathAllowed('/admin/roster')).toBe(true)
    expect(isStaffReturnPathAllowed('/admin/auth/callback')).toBe(false)
    expect(isStaffReturnPathAllowed('/admin/login')).toBe(false)
    expect(isStaffReturnPathAllowed('/catalog')).toBe(false)
  })

  it('normalizes disallowed paths to /admin', () => {
    expect(normalizeStaffReturnPath('/catalog')).toBe('/admin')
    expect(normalizeStaffReturnPath('/admin/login')).toBe('/admin')
    expect(normalizeStaffReturnPath('/admin/reports')).toBe('/admin/reports')
  })

  it('popStaffReturnPath clears session storage and normalizes', () => {
    sessionStorage.setItem('riffsync.staff.returnTo', '/admin/catalog-edit')
    expect(popStaffReturnPath()).toBe('/admin/catalog-edit')
    expect(sessionStorage.getItem('riffsync.staff.returnTo')).toBeNull()
    expect(popStaffReturnPath()).toBe('/admin')
  })
})

describe('staffHostedUiPkce OAuth state', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('exchangeStaffAuthorizationCode throws on state mismatch', async () => {
    const { exchangeStaffAuthorizationCode } = await import('./staffHostedUiPkce')
    sessionStorage.setItem('riffsync.staff.oauthState', 'expected')
    sessionStorage.setItem('riffsync.staff.pkceVerifier', 'verifier')
    await expect(exchangeStaffAuthorizationCode('code', 'wrong')).rejects.toThrow(/state mismatch/i)
  })
})
