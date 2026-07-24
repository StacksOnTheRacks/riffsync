import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FAN_AUTH_REQUIRED_CLIENT, requireFanAccessToken } from './requireFanAccessToken'

const getFanAccessToken = vi.fn<() => string | null>()

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: () => getFanAccessToken(),
}))

describe('requireFanAccessToken', () => {
  beforeEach(() => {
    getFanAccessToken.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when fan access token is absent', () => {
    getFanAccessToken.mockReturnValue(null)
    expect(requireFanAccessToken()).toBeNull()
  })

  it('returns the fan access token when present', () => {
    getFanAccessToken.mockReturnValue('fan-jwt')
    expect(requireFanAccessToken()).toBe('fan-jwt')
  })

  it('exports stable client-side fan_auth_required failure shape', () => {
    expect(FAN_AUTH_REQUIRED_CLIENT).toEqual({
      ok: false,
      status: 401,
      code: 'fan_auth_required',
      error: 'Fan authentication required',
    })
  })
})
