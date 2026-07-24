import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ensureDmThread,
  fetchDmMessages,
  markDmRead,
  postDmMessage,
} from './dmApi'
import { FAN_AUTH_REQUIRED_CLIENT } from './requireFanAccessToken'

const getFanAccessToken = vi.fn<() => string | null>()

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: () => getFanAccessToken(),
}))

describe('dmApi fan auth gate (#365)', () => {
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

    await expect(postDmMessage('staff-token', 'a#b', { messageId: 'm1', kind: 'text', body: 'hi' })).resolves.toEqual(
      FAN_AUTH_REQUIRED_CLIENT,
    )
    await expect(ensureDmThread('staff-token', 'fan-b')).resolves.toEqual(FAN_AUTH_REQUIRED_CLIENT)
    await expect(fetchDmMessages('staff-token', 'a#b')).resolves.toEqual(FAN_AUTH_REQUIRED_CLIENT)
    await expect(markDmRead('staff-token', 'a#b', 1, 'm1')).resolves.toEqual(FAN_AUTH_REQUIRED_CLIENT)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
