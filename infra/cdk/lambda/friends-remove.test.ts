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
  TransactWriteCommand: vi.fn((input: unknown) => ({ input, kind: 'TransactWrite' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

import { handler } from './friends-remove';
import { friendshipPairKey, friendshipRateLimitKey, minuteBucketEpochMs } from './friends-shared';

function fanEvent(
  pairKey: string,
  opts?: { claims?: Record<string, unknown> },
): APIGatewayProxyEventV2 {
  const path = `/v1/friends/${encodeURIComponent(pairKey)}`;
  return {
    version: '2.0',
    routeKey: `DELETE ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    pathParameters: { pairKey },
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'DELETE',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-friends-remove-1',
      routeKey: `DELETE ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: opts?.claims ? { jwt: { claims: opts.claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('friends-remove handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.FRIEND_ACTION_LIMIT_PER_MINUTE = '30';
    delete process.env.DM_THREADS_TABLE_NAME;
  });

  it('returns 401 fan_auth_required without fan JWT', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(fanEvent(pairKey), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(401);
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      error: 'Fan authentication required',
      code: 'fan_auth_required',
    });
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 403 friendship_not_member when caller is not in pairKey', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(fanEvent(pairKey, { claims: { sub: 'fan-c' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friendship_not_member');
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 403 friendship_not_member for malformed pairKey', async () => {
    const res = await handler(fanEvent('not-a-valid-pair', { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friendship_not_member');
  });

  it('returns 404 friendship_not_found when edge is absent', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({}) // rate limit
      .mockResolvedValueOnce({ Item: undefined }); // friendship get

    const res = await handler(fanEvent(pairKey, { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(404);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friendship_not_found');
  });

  it('returns 429 rate_limited when action throttle exceeded', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const bucket = minuteBucketEpochMs();
    mocks.docSend.mockRejectedValueOnce({
      name: 'ConditionalCheckFailedException',
    });

    const res = await handler(fanEvent(pairKey, { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');

    const rateCall = mocks.docSend.mock.calls[0]?.[0];
    expect(rateCall?.kind).toBe('Update');
    expect(rateCall?.input?.Key).toEqual(friendshipRateLimitKey('action', 'fan-a', bucket).pk
      ? friendshipRateLimitKey('action', 'fan-a', bucket)
      : expect.anything());
  });

  it('returns 200 and hard-deletes both friendship rows', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({}) // rate limit
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } }) // friendship get
      .mockResolvedValueOnce({}); // transact

    const res = await handler(fanEvent(pairKey, { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);
    expect(body.pairKey).toBe('fan-a#fan-b');
    expect(typeof body.removedAt).toBe('number');

    const transactCall = mocks.docSend.mock.calls.find((c) => c[0]?.kind === 'TransactWrite');
    expect(transactCall?.[0]?.input?.TransactItems).toEqual([
      {
        Delete: {
          TableName: 'Friendships',
          Key: { pairKey: 'fan-a#fan-b', fanSub: 'fan-a' },
          ConditionExpression: 'attribute_exists(pairKey)',
        },
      },
      {
        Delete: {
          TableName: 'Friendships',
          Key: { pairKey: 'fan-a#fan-b', fanSub: 'fan-b' },
          ConditionExpression: 'attribute_exists(pairKey)',
        },
      },
    ]);
  });

  it('allows either party to remove the friendship', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-b' } })
      .mockResolvedValueOnce({});

    const res = await handler(fanEvent(pairKey, { claims: { sub: 'fan-b' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(200);
  });

  it('soft-closes DmThread in the same TransactWrite when table is wired', async () => {
    process.env.DM_THREADS_TABLE_NAME = 'DmThreads';
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({}) // rate limit
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } }) // friendship get
      .mockResolvedValueOnce({ Item: { pairKey, status: 'open' } }) // dm thread get
      .mockResolvedValueOnce({}); // transact

    const res = await handler(fanEvent(pairKey, { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);

    const transactCall = mocks.docSend.mock.calls.find((c) => c[0]?.kind === 'TransactWrite');
    const items = transactCall?.[0]?.input?.TransactItems ?? [];
    expect(items).toHaveLength(3);
    expect(items[2]?.Update?.TableName).toBe('DmThreads');
    expect(items[2]?.Update?.ExpressionAttributeValues?.[':closed']).toBe('closed');
    expect(items[2]?.Update?.ExpressionAttributeValues?.[':closedAt']).toBe(body.removedAt);
  });

  it('skips DmThread update when no thread row exists', async () => {
    process.env.DM_THREADS_TABLE_NAME = 'DmThreads';
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({});

    const res = await handler(fanEvent(pairKey, { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const transactCall = mocks.docSend.mock.calls.find((c) => c[0]?.kind === 'TransactWrite');
    expect(transactCall?.[0]?.input?.TransactItems).toHaveLength(2);
  });

  it('returns 404 on idempotent second remove after transact race', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockRejectedValueOnce({ name: 'TransactionCanceledException' })
      .mockResolvedValueOnce({ Item: undefined });

    const res = await handler(fanEvent(pairKey, { claims: { sub: 'fan-a' } }), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(404);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friendship_not_found');
  });
});
