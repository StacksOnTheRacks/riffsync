import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelFriendRequest, fetchFriendRosterSnapshot, sendFriendRequest } from './friendsApi'

describe('friendsApi', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_API_BASE_URL', 'https://api.test.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sendFriendRequest posts recipientSub', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        requestId: 'req-1',
        requesterSub: 'fan-a',
        recipientSub: 'fan-b',
        createdAt: 100,
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendFriendRequest('token', 'fan-b')

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test.example/v1/friends/requests',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ recipientSub: 'fan-b' }),
      }),
    )
  })

  it('cancelFriendRequest deletes by request id', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 204,
      json: async () => ({}),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await cancelFriendRequest('token', 'req-9')

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test.example/v1/friends/requests/req-9',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('fetchFriendRosterSnapshot loads friends and pending requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/v1/friends')) {
          return {
            ok: true,
            json: async () => ({
              friends: [{ fanSub: 'fan-b', pairKey: 'a#b', displayName: 'B', online: true, hasUnread: false, createdAt: 1 }],
              anyUnread: false,
            }),
          }
        }
        return {
          ok: true,
          json: async () => ({
            inbound: [],
            outbound: [{ requestId: 'req-2', requesterSub: 'fan-a', recipientSub: 'fan-c', createdAt: 2 }],
          }),
        }
      }),
    )

    const snapshot = await fetchFriendRosterSnapshot('token')

    expect(snapshot?.friends).toHaveLength(1)
    expect(snapshot?.outbound).toHaveLength(1)
  })
})
