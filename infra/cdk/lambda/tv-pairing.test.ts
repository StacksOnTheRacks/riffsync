import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send }),
  },
  GetCommand: vi.fn((input) => ({ input, _type: 'Get' })),
  PutCommand: vi.fn((input) => ({ input, _type: 'Put' })),
  QueryCommand: vi.fn((input) => ({ input, _type: 'Query' })),
  UpdateCommand: vi.fn((input) => ({ input, _type: 'Update' })),
}))

describe('tv-pairing handler', () => {
  beforeEach(() => {
    vi.resetModules()
    send.mockReset()
    process.env.TV_PAIRING_TABLE_NAME = 'tv-pairing-test'
  })

  it('creates a pairing code', async () => {
    send.mockResolvedValueOnce({})
    const { handler } = await import('./tv-pairing')
    const res = await handler(
      {
        rawPath: '/v1/tv/pairing',
        requestContext: { http: { method: 'POST', path: '/v1/tv/pairing' } },
        body: '{}',
      } as never,
      {} as never,
      () => undefined,
    )
    expect(res && typeof res === 'object' && 'statusCode' in res ? res.statusCode : 0).toBe(201)
    const body = JSON.parse(
      res && typeof res === 'object' && 'body' in res && typeof res.body === 'string' ? res.body : '{}',
    ) as { code?: string; pairingId?: string; pollToken?: string }
    expect(body.code).toMatch(/^[A-Z2-9]{6}$/)
    expect(body.pairingId).toBeTruthy()
    expect(body.pollToken).toBeTruthy()
  })

  it('claims a waiting code', async () => {
    send
      .mockResolvedValueOnce({
        Items: [
          {
            code: 'ABC123',
            pairingId: 'pair-1',
            pollToken: 'poll',
            status: 'waiting',
            expiresAt: Math.floor(Date.now() / 1000) + 600,
          },
        ],
      })
      .mockResolvedValueOnce({})
    const { handler } = await import('./tv-pairing')
    const res = await handler(
      {
        rawPath: '/v1/tv/pairing/claim',
        requestContext: { http: { method: 'POST', path: '/v1/tv/pairing/claim' } },
        body: JSON.stringify({
          code: 'ABC123',
          roomId: 'room-1',
          sessionId: 'sess-1',
          tvClientSessionId: 'tv-client-1',
        }),
      } as never,
      {} as never,
      () => undefined,
    )
    expect(res && typeof res === 'object' && 'statusCode' in res ? res.statusCode : 0).toBe(200)
    const body = JSON.parse(
      res && typeof res === 'object' && 'body' in res && typeof res.body === 'string' ? res.body : '{}',
    ) as { pairingId?: string; claimToken?: string }
    expect(body.pairingId).toBe('pair-1')
    expect(body.claimToken).toBeTruthy()
  })
})
