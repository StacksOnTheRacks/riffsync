import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { postDmMessage } from './dmApi'

describe('postDmMessage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_API_BASE_URL', 'https://api.test.example')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns persisted message on 201', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        pairKey: 'a#b',
        messageId: 'm1',
        senderSub: 'a',
        kind: 'text',
        body: 'hello',
        sentAt: 100,
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await postDmMessage('token', 'a#b', {
      messageId: 'm1',
      kind: 'text',
      body: 'hello',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.message.body).toBe('hello')
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test.example/v1/dm/threads/a%23b/messages',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns structured failure on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ code: 'friendship_not_active', error: 'Active friendship required' }),
      })),
    )

    const result = await postDmMessage('token', 'a#b', {
      messageId: 'm1',
      kind: 'text',
      body: 'hello',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('friendship_not_active')
    }
  })
})
