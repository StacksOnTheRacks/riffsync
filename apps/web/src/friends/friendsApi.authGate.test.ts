import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  fetchFriendRosterSnapshot,
  removeFriend,
  sendFriendRequest,
} from './friendsApi'
import { FAN_AUTH_REQUIRED_CLIENT } from './requireFanAccessToken'

const getFanAccessToken = vi.fn<() => string | null>()

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: () => getFanAccessToken(),
}))

describe('friendsApi fan auth gate (#365)', () => {
  beforeEach(() => {
    getFanAccessToken.mockReturnValue(null)
    vi.stubEnv('VITE_PUBLIC_API_BASE_URL', 'https://api.test.example')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('does not fetch when fan access token is absent', async () => {
    const fetchMock = vi.mocked(fetch)

    expect(await fetchFriendRosterSnapshot('staff-token')).toBeNull()
    await expect(sendFriendRequest('staff-token', 'fan-b')).resolves.toEqual(FAN_AUTH_REQUIRED_CLIENT)
    await expect(cancelFriendRequest('staff-token', 'req-1')).resolves.toEqual(FAN_AUTH_REQUIRED_CLIENT)
    await expect(acceptFriendRequest('staff-token', 'req-1')).resolves.toEqual(FAN_AUTH_REQUIRED_CLIENT)
    await expect(declineFriendRequest('staff-token', 'req-1')).resolves.toEqual(FAN_AUTH_REQUIRED_CLIENT)
    await expect(removeFriend('staff-token', 'a#b')).resolves.toEqual(FAN_AUTH_REQUIRED_CLIENT)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
