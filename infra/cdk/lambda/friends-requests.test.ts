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
  DeleteCommand: vi.fn((input: unknown) => ({ input, kind: 'Delete' })),
  QueryCommand: vi.fn((input: unknown) => ({ input, kind: 'Query' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
  TransactWriteCommand: vi.fn((input: unknown) => ({ input, kind: 'TransactWrite' })),
}));

import { handler } from './friends-requests';
import {
  friendshipPairKey,
  friendshipRateLimitKey,
  minuteBucketEpochMs,
} from './friends-shared';

function fanEvent(
  method: string,
  path: string,
  opts?: {
    claims?: Record<string, unknown>;
    body?: Record<string, unknown>;
    pathParameters?: Record<string, string>;
  },
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    pathParameters: opts?.pathParameters,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-friends-1',
      routeKey: `${method} ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: opts?.claims ? { jwt: { claims: opts.claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

function pendingItem(overrides: Partial<{
  requestId: string;
  requesterSub: string;
  recipientSub: string;
  createdAt: number;
}> = {}) {
  const requesterSub = overrides.requesterSub ?? 'fan-a';
  const recipientSub = overrides.recipientSub ?? 'fan-b';
  return {
    requestId: overrides.requestId ?? 'req-1',
    requesterSub,
    recipientSub,
    status: 'pending' as const,
    pairKey: friendshipPairKey(requesterSub, recipientSub),
    createdAt: overrides.createdAt ?? 1_700_000_000_000,
  };
}

describe('friends-requests handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.FRIENDSHIP_REQUESTS_TABLE_NAME = 'FriendshipRequests';
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.FRIEND_INVITE_LIMIT_PER_MINUTE = '10';
    process.env.FRIEND_ACTION_LIMIT_PER_MINUTE = '30';
  });

  it('returns 401 fan_auth_required without fan JWT', async () => {
    const res = await handler(fanEvent('POST', '/v1/friends/requests', { body: { recipientSub: 'fan-b' } }), {} as never, {} as never);
    expect(res && typeof res === 'object' && 'statusCode' in res ? res.statusCode : 0).toBe(401);
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      error: 'Fan authentication required',
      code: 'fan_auth_required',
    });
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 400 cannot_friend_self', async () => {
    const res = await handler(
      fanEvent('POST', '/v1/friends/requests', {
        claims: { sub: 'fan-a' },
        body: { recipientSub: 'fan-a' },
      }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(400);
    expect(JSON.parse((res as { body: string }).body).code).toBe('cannot_friend_self');
  });

  it('creates a pending invite with 201', async () => {
    mocks.docSend
      .mockResolvedValueOnce({}) // rate limit
      .mockResolvedValueOnce({ Items: [] }) // friendship exists
      .mockResolvedValueOnce({ Items: [] }) // pending by pair
      .mockResolvedValueOnce({}); // put

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests', {
        claims: { sub: 'fan-a' },
        body: { recipientSub: 'fan-b' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(201);
    const body = JSON.parse((res as { body: string }).body);
    expect(body.requesterSub).toBe('fan-a');
    expect(body.recipientSub).toBe('fan-b');
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);

    const putCall = mocks.docSend.mock.calls.find((c) => c[0]?.kind === 'Put');
    expect(putCall?.[0]?.input?.Item?.pairKey).toBe('fan-a#fan-b');
    expect(putCall?.[0]?.input?.Item?.status).toBe('pending');
  });

  it('returns 200 with existing request for same-direction re-invite', async () => {
    const existing = pendingItem();
    mocks.docSend
      .mockResolvedValueOnce({}) // rate limit
      .mockResolvedValueOnce({ Items: [] }) // friendship
      .mockResolvedValueOnce({ Items: [existing] }); // pending

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests', {
        claims: { sub: 'fan-a' },
        body: { recipientSub: 'fan-b' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(200);
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      requestId: 'req-1',
      requesterSub: 'fan-a',
      recipientSub: 'fan-b',
      createdAt: existing.createdAt,
    });
  });

  it('returns 409 friend_request_inbound_exists for opposite pending', async () => {
    const inbound = pendingItem({ requesterSub: 'fan-b', recipientSub: 'fan-a' });
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [inbound] });

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests', {
        claims: { sub: 'fan-a' },
        body: { recipientSub: 'fan-b' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(409);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friend_request_inbound_exists');
  });

  it('returns 409 already_friends when friendship edge exists', async () => {
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: [{ pairKey: 'fan-a#fan-b' }] });

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests', {
        claims: { sub: 'fan-a' },
        body: { recipientSub: 'fan-b' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(409);
    expect(JSON.parse((res as { body: string }).body).code).toBe('already_friends');
  });

  it('lists inbound and outbound pending for caller only', async () => {
    const inbound = pendingItem({ requestId: 'in-1', requesterSub: 'fan-b', recipientSub: 'fan-a' });
    const outbound = pendingItem({ requestId: 'out-1', requesterSub: 'fan-a', recipientSub: 'fan-c' });
    mocks.docSend
      .mockResolvedValueOnce({ Items: [inbound] })
      .mockResolvedValueOnce({ Items: [outbound] });

    const res = await handler(
      fanEvent('GET', '/v1/friends/requests', { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(200);
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      inbound: [
        {
          requestId: 'in-1',
          requesterSub: 'fan-b',
          recipientSub: 'fan-a',
          createdAt: inbound.createdAt,
        },
      ],
      outbound: [
        {
          requestId: 'out-1',
          requesterSub: 'fan-a',
          recipientSub: 'fan-c',
          createdAt: outbound.createdAt,
        },
      ],
    });
  });

  it('accept creates friendship and clears all pendings for the pair', async () => {
    const primary = pendingItem({ requestId: 'req-1', requesterSub: 'fan-a', recipientSub: 'fan-b' });
    const reciprocal = pendingItem({ requestId: 'req-2', requesterSub: 'fan-b', recipientSub: 'fan-a' });
    mocks.docSend
      .mockResolvedValueOnce({}) // rate limit
      .mockResolvedValueOnce({ Item: primary }) // get
      .mockResolvedValueOnce({ Items: [primary, reciprocal] }) // query pair
      .mockResolvedValueOnce({}); // transact

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests/req-1/accept', {
        claims: { sub: 'fan-b' },
        pathParameters: { requestId: 'req-1' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);
    expect(body.pairKey).toBe('fan-a#fan-b');
    expect(body.fanSubA).toBe('fan-a');
    expect(body.fanSubB).toBe('fan-b');
    expect(typeof body.createdAt).toBe('number');

    const tx = mocks.docSend.mock.calls.find((c) => c[0]?.kind === 'TransactWrite');
    const items = tx?.[0]?.input?.TransactItems ?? [];
    expect(items.filter((i: { Delete?: unknown }) => i.Delete)).toHaveLength(2);
    expect(items.filter((i: { Put?: unknown }) => i.Put)).toHaveLength(2);
  });

  it('accept returns 403 friend_request_not_recipient for requester', async () => {
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: pendingItem() });

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests/req-1/accept', {
        claims: { sub: 'fan-a' },
        pathParameters: { requestId: 'req-1' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friend_request_not_recipient');
  });

  it('decline hard-deletes and returns 204 for recipient', async () => {
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: pendingItem() })
      .mockResolvedValueOnce({});

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests/req-1/decline', {
        claims: { sub: 'fan-b' },
        pathParameters: { requestId: 'req-1' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(204);
    expect(mocks.docSend.mock.calls.some((c) => c[0]?.kind === 'Delete')).toBe(true);
  });

  it('cancel returns 403 friend_request_not_requester for recipient', async () => {
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: pendingItem() });

    const res = await handler(
      fanEvent('DELETE', '/v1/friends/requests/req-1', {
        claims: { sub: 'fan-b' },
        pathParameters: { requestId: 'req-1' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friend_request_not_requester');
  });

  it('cancel hard-deletes and returns 204 for requester', async () => {
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: pendingItem() })
      .mockResolvedValueOnce({});

    const res = await handler(
      fanEvent('DELETE', '/v1/friends/requests/req-1', {
        claims: { sub: 'fan-a' },
        pathParameters: { requestId: 'req-1' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(204);
  });

  it('returns 429 rate_limited when invite throttle is exceeded', async () => {
    mocks.docSend.mockRejectedValueOnce(
      Object.assign(new Error('limit'), { name: 'ConditionalCheckFailedException' }),
    );

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests', {
        claims: { sub: 'fan-a' },
        body: { recipientSub: 'fan-b' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');

    const update = mocks.docSend.mock.calls[0]?.[0];
    expect(update?.kind).toBe('Update');
    const bucket = minuteBucketEpochMs();
    expect(update?.input?.Key).toEqual(friendshipRateLimitKey('invite', 'fan-a', bucket));
  });

  it('returns 429 rate_limited when accept/decline/cancel throttle is exceeded', async () => {
    mocks.docSend.mockRejectedValueOnce(
      Object.assign(new Error('limit'), { name: 'ConditionalCheckFailedException' }),
    );

    const res = await handler(
      fanEvent('POST', '/v1/friends/requests/req-1/accept', {
        claims: { sub: 'fan-b' },
        pathParameters: { requestId: 'req-1' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');
    const update = mocks.docSend.mock.calls[0]?.[0];
    expect(update?.input?.Key?.pk).toContain('friend-action#fan-b');
  });
});

describe('friendshipPairKey', () => {
  it('orders subs lexicographically', () => {
    expect(friendshipPairKey('b', 'a')).toBe('a#b');
    expect(friendshipPairKey('a', 'b')).toBe('a#b');
  });
});
