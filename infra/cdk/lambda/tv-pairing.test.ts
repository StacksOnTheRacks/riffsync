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

  it('releases a linked pairing so the TV poll can stop playback', async () => {
    send
      .mockResolvedValueOnce({
        Item: {
          pairingId: 'pair-1',
          pollToken: 'poll',
          claimToken: 'claim',
          status: 'linked',
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          snapshotJson: '{"snapshotId":"s1"}',
          roomId: 'room-1',
          sessionId: 'sess-1',
        },
      })
      .mockResolvedValueOnce({})
    const { handler } = await import('./tv-pairing')
    const res = await handler(
      {
        rawPath: '/v1/tv/pairing/pair-1/release',
        pathParameters: { pairingId: 'pair-1' },
        requestContext: {
          http: { method: 'POST', path: '/v1/tv/pairing/pair-1/release' },
        },
        body: JSON.stringify({ claimToken: 'claim' }),
      } as never,
      {} as never,
      () => undefined,
    )
    expect(res && typeof res === 'object' && 'statusCode' in res ? res.statusCode : 0).toBe(204)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('polls released status after host stop', async () => {
    send.mockResolvedValueOnce({
      Item: {
        pairingId: 'pair-1',
        pollToken: 'poll',
        claimToken: 'claim',
        status: 'released',
        expiresAt: Math.floor(Date.now() / 1000) + 30,
      },
    })
    const { handler } = await import('./tv-pairing')
    const res = await handler(
      {
        rawPath: '/v1/tv/pairing/pair-1',
        pathParameters: { pairingId: 'pair-1' },
        queryStringParameters: { pollToken: 'poll' },
        requestContext: { http: { method: 'GET', path: '/v1/tv/pairing/pair-1' } },
      } as never,
      {} as never,
      () => undefined,
    )
    expect(res && typeof res === 'object' && 'statusCode' in res ? res.statusCode : 0).toBe(200)
    const body = JSON.parse(
      res && typeof res === 'object' && 'body' in res && typeof res.body === 'string' ? res.body : '{}',
    ) as { status?: string }
    expect(body.status).toBe('released')
  })
})
