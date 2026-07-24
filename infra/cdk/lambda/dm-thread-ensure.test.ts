import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
  PutCommand: vi.fn((input: unknown) => ({ input, kind: 'Put' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

import { handler } from './dm-thread-ensure';
import { dmReadRateLimitKey, friendshipPairKey } from './dm-shared';
import { minuteBucketEpochMs } from './friends-shared';

function ensureEvent(
  peerSub: string,
  opts?: { claims?: Record<string, unknown> },
): APIGatewayProxyEventV2 {
  const path = `/v1/dm/threads/${encodeURIComponent(peerSub)}`;
  return {
    version: '2.0',
    routeKey: `PUT ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    pathParameters: { peerSub },
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'PUT',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-dm-ensure-1',
      routeKey: `PUT ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: opts?.claims ? { jwt: { claims: opts.claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('dm-thread-ensure handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.DM_THREADS_TABLE_NAME = 'DmThreads';
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.DM_READ_LIMIT_PER_MINUTE = '60';
  });

  it('returns 401 fan_auth_required without fan JWT', async () => {
    const res = await handler(ensureEvent('fan-b'), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(401);
    expect(JSON.parse((res as { body: string }).body).code).toBe('fan_auth_required');
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 400 cannot_dm_self when peerSub equals caller sub', async () => {
    const res = await handler(ensureEvent('fan-a', { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(400);
    expect(JSON.parse((res as { body: string }).body).code).toBe('cannot_dm_self');
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 403 friendship_not_active when no friendship edge', async () => {
    mocks.docSend
      .mockResolvedValueOnce({}) // rate limit
      .mockResolvedValueOnce({ Item: undefined }); // friendship get

    const res = await handler(ensureEvent('fan-b', { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friendship_not_active');
  });

  it('returns 403 dm_thread_closed when thread is closed', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({
        Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'closed', openedAt: 1, updatedAt: 2, closedAt: 3 },
      });

    const res = await handler(ensureEvent('fan-b', { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_thread_closed');
  });

  it('returns 200 idempotently when thread already open', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({
        Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'open', openedAt: 1000, updatedAt: 1000 },
      });

    const res = await handler(ensureEvent('fan-b', { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);
    expect(body).toEqual({
      pairKey: 'fan-a#fan-b',
      peerSub: 'fan-b',
      status: 'open',
      openedAt: 1000,
    });
    expect(mocks.docSend.mock.calls.some((c) => c[0]?.kind === 'Put')).toBe(false);
  });

  it('creates DmThread row when missing', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({});

    const res = await handler(ensureEvent('fan-b', { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);
    expect(body.pairKey).toBe('fan-a#fan-b');
    expect(body.peerSub).toBe('fan-b');
    expect(body.status).toBe('open');
    expect(typeof body.openedAt).toBe('number');

    const putCall = mocks.docSend.mock.calls.find((c) => c[0]?.kind === 'Put');
    expect(putCall?.[0]?.input?.TableName).toBe('DmThreads');
    expect(putCall?.[0]?.input?.Item?.pairKey).toBe('fan-a#fan-b');
    expect(putCall?.[0]?.input?.Item?.status).toBe('open');
  });

  it('returns 429 rate_limited when read throttle exceeded', async () => {
    mocks.docSend.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });

    const res = await handler(ensureEvent('fan-b', { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');

    const bucket = minuteBucketEpochMs();
    expect(mocks.docSend.mock.calls[0]?.[0]?.input?.Key).toEqual(
      dmReadRateLimitKey('fan-a', bucket),
    );
  });
});
