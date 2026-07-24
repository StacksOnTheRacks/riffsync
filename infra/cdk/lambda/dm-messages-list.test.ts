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
  QueryCommand: vi.fn((input: unknown) => ({ input, kind: 'Query' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

import { handler } from './dm-messages-list';
import {
  directMessageSortKey,
  dmReadRateLimitKey,
  encodeHistoryCursor,
  friendshipPairKey,
} from './dm-shared';
import { minuteBucketEpochMs } from './friends-shared';

function historyEvent(
  pairKey: string,
  opts?: { claims?: Record<string, unknown>; query?: Record<string, string> },
): APIGatewayProxyEventV2 {
  const path = `/v1/dm/threads/${encodeURIComponent(pairKey)}/messages`;
  const query = opts?.query ?? {};
  const rawQueryString = Object.entries(query)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return {
    version: '2.0',
    routeKey: `GET ${path}`,
    rawPath: path,
    rawQueryString,
    headers: {},
    pathParameters: { pairKey },
    queryStringParameters: Object.keys(query).length > 0 ? query : undefined,
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-dm-history-1',
      routeKey: `GET ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: opts?.claims ? { jwt: { claims: opts.claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('dm-messages-list handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.DM_THREADS_TABLE_NAME = 'DmThreads';
    process.env.DIRECT_MESSAGES_TABLE_NAME = 'DirectMessages';
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.DM_READ_LIMIT_PER_MINUTE = '60';
  });

  it('returns 401 fan_auth_required without fan JWT', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(historyEvent(pairKey), {} as never, {} as never);
    expect((res as { statusCode: number }).statusCode).toBe(401);
    expect(JSON.parse((res as { body: string }).body).code).toBe('fan_auth_required');
  });

  it('returns 403 dm_not_member when caller is not in pairKey', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(
      historyEvent(pairKey, { claims: { sub: 'fan-c' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_not_member');
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 403 friendship_not_active when friendship edge missing', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: undefined });

    const res = await handler(
      historyEvent(pairKey, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('friendship_not_active');
  });

  it('returns 404 dm_thread_not_found when no thread row', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({ Item: undefined });

    const res = await handler(
      historyEvent(pairKey, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(404);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_thread_not_found');
  });

  it('returns 403 dm_thread_closed after remove-friend', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({
        Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'closed', openedAt: 1, updatedAt: 2, closedAt: 3 },
      });

    const res = await handler(
      historyEvent(pairKey, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_thread_closed');
  });

  it('returns empty messages for new thread', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({
        Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'open', openedAt: 1, updatedAt: 1 },
      })
      .mockResolvedValueOnce({ Items: [] });

    const res = await handler(
      historyEvent(pairKey, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);
    expect(body.messages).toEqual([]);
    expect(body.nextCursor).toBeNull();

    const queryCall = mocks.docSend.mock.calls.find((c) => c[0]?.kind === 'Query');
    expect(queryCall?.[0]?.input?.TableName).toBe('DirectMessages');
    expect(queryCall?.[0]?.input?.ScanIndexForward).toBe(false);
  });

  it('returns seeded messages newest-first with pagination cursor', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const msgNew = {
      pairKey: 'fan-a#fan-b',
      sk: directMessageSortKey(2000, 'msg-new'),
      messageId: 'msg-new',
      senderSub: 'fan-a',
      kind: 'text',
      body: 'hello',
      sentAt: 2000,
    };
    const msgOld = {
      pairKey: 'fan-a#fan-b',
      sk: directMessageSortKey(1000, 'msg-old'),
      messageId: 'msg-old',
      senderSub: 'fan-b',
      kind: 'text',
      body: 'hi',
      sentAt: 1000,
    };

    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({
        Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'open', openedAt: 1, updatedAt: 1 },
      })
      .mockResolvedValueOnce({
        Items: [msgNew, msgOld],
        LastEvaluatedKey: { pairKey: 'fan-a#fan-b', sk: msgOld.sk },
      });

    const res = await handler(
      historyEvent(pairKey, { claims: { sub: 'fan-a' }, query: { limit: '2' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);
    expect(body.messages).toEqual([
      { messageId: 'msg-new', senderSub: 'fan-a', kind: 'text', body: 'hello', sentAt: 2000 },
      { messageId: 'msg-old', senderSub: 'fan-b', kind: 'text', body: 'hi', sentAt: 1000 },
    ]);
    expect(body.nextCursor).toBe(encodeHistoryCursor({ sentAt: 1000, messageId: 'msg-old' }));
  });

  it('passes before cursor as ExclusiveStartKey', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const before = encodeHistoryCursor({ sentAt: 1000, messageId: 'msg-old' });
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({
        Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'open', openedAt: 1, updatedAt: 1 },
      })
      .mockResolvedValueOnce({ Items: [] });

    await handler(
      historyEvent(pairKey, { claims: { sub: 'fan-a' }, query: { before } }),
      {} as never,
      {} as never,
    );

    const queryCall = mocks.docSend.mock.calls.find((c) => c[0]?.kind === 'Query');
    expect(queryCall?.[0]?.input?.ExclusiveStartKey).toEqual({
      pairKey: 'fan-a#fan-b',
      sk: directMessageSortKey(1000, 'msg-old'),
    });
  });

  it('returns 429 rate_limited when read throttle exceeded', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });

    const res = await handler(
      historyEvent(pairKey, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');

    const bucket = minuteBucketEpochMs();
    expect(mocks.docSend.mock.calls[0]?.[0]?.input?.Key).toEqual(
      dmReadRateLimitKey('fan-a', bucket),
    );
  });
});
