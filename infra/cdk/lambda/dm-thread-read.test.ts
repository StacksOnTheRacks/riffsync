import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  pushDmUnreadToRecipient: vi.fn(),
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

vi.mock('./fan-dm-shared', () => ({
  pushDmUnreadToRecipient: mocks.pushDmUnreadToRecipient,
}));

import { handler } from './dm-thread-read';
import { dmReadRateLimitKey, friendshipPairKey } from './dm-shared';
import { minuteBucketEpochMs } from './friends-shared';

function readEvent(
  pairKey: string,
  body: Record<string, unknown>,
  opts?: { claims?: Record<string, unknown> },
): APIGatewayProxyEventV2 {
  const path = `/v1/dm/threads/${encodeURIComponent(pairKey)}/read`;
  return {
    version: '2.0',
    routeKey: `POST ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    pathParameters: { pairKey },
    body: JSON.stringify(body),
    requestContext: {
      accountId: '123',
      apiId: 'api',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-dm-read-1',
      routeKey: `POST ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: opts?.claims ? { jwt: { claims: opts.claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('dm-thread-read handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    mocks.pushDmUnreadToRecipient.mockReset();
    mocks.pushDmUnreadToRecipient.mockResolvedValue(undefined);
    process.env.DM_THREADS_TABLE_NAME = 'DmThreads';
    process.env.DIRECT_MESSAGES_TABLE_NAME = 'DirectMessages';
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.DM_UNREAD_TABLE_NAME = 'DmUnread';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.FAN_CONNECTIONS_TABLE_NAME = 'FanConnections';
    process.env.DM_READ_LIMIT_PER_MINUTE = '60';
  });

  it('returns 401 fan_auth_required without fan JWT', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(
      readEvent(pairKey, { lastReadSentAt: 100, lastReadMessageId: 'msg-1' }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(401);
    expect(JSON.parse((res as { body: string }).body).code).toBe('fan_auth_required');
  });

  it('returns 400 invalid_read_cursor for malformed body', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(
      readEvent(pairKey, { lastReadSentAt: 'bad', lastReadMessageId: '' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(400);
    expect(JSON.parse((res as { body: string }).body).code).toBe('invalid_read_cursor');
  });

  it('returns 403 dm_not_member when caller is not in pairKey', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(
      readEvent(pairKey, { lastReadSentAt: 100, lastReadMessageId: 'msg-1' }, { claims: { sub: 'fan-c' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_not_member');
  });

  it('returns 403 friendship_not_active when friendship edge missing', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend.mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: undefined });

    const res = await handler(
      readEvent(pairKey, { lastReadSentAt: 100, lastReadMessageId: 'msg-1' }, { claims: { sub: 'fan-a' } }),
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
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Item: undefined });

    const res = await handler(
      readEvent(pairKey, { lastReadSentAt: 100, lastReadMessageId: 'msg-1' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(404);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_thread_not_found');
  });

  it('ignores stale read cursor and returns current state', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({
        Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'open', openedAt: 1, updatedAt: 2 },
      })
      .mockResolvedValueOnce({
        Item: {
          recipientSub: 'fan-a',
          pairKey,
          lastReadSentAt: 500,
          lastReadMessageId: 'msg-newer',
          hasUnread: false,
          updatedAt: 600,
        },
      });

    const res = await handler(
      readEvent(pairKey, { lastReadSentAt: 100, lastReadMessageId: 'msg-old' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(200);
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      pairKey,
      lastReadSentAt: 500,
      lastReadMessageId: 'msg-newer',
      hasUnread: false,
    });
    expect(mocks.docSend.mock.calls.filter((call) => call[0].kind === 'Update' && call[0].input?.TableName === 'DmUnread')).toHaveLength(0);
    expect(mocks.pushDmUnreadToRecipient).not.toHaveBeenCalled();
  });

  it('returns 200, updates cursor, recomputes hasUnread, and pushes dm_unread', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce({
        Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'open', openedAt: 1, updatedAt: 2 },
      })
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({
        Items: [
          {
            pairKey,
            sk: 'm#0000000000500#msg-tip',
            messageId: 'msg-tip',
            senderSub: 'fan-b',
            kind: 'text',
            body: 'latest',
            sentAt: 500,
          },
        ],
      })
      .mockResolvedValueOnce({});

    const res = await handler(
      readEvent(pairKey, { lastReadSentAt: 500, lastReadMessageId: 'msg-tip' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(200);
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      pairKey,
      lastReadSentAt: 500,
      lastReadMessageId: 'msg-tip',
      hasUnread: false,
    });

    const updateCall = mocks.docSend.mock.calls.find(
      (call) => call[0].kind === 'Update' && call[0].input?.TableName === 'DmUnread',
    );
    expect(updateCall).toBeTruthy();
    expect((updateCall![0].input as { TableName: string }).TableName).toBe('DmUnread');

    expect(mocks.pushDmUnreadToRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientFanSub: 'fan-a',
        pairKey,
        hasUnread: false,
        lastReadSentAt: 500,
        lastReadMessageId: 'msg-tip',
      }),
    );
  });

  it('returns 429 rate_limited at combined DM read throttle', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const bucketMs = minuteBucketEpochMs();
    const { pk, sk } = dmReadRateLimitKey('fan-a', bucketMs);
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    mocks.docSend.mockRejectedValueOnce(err);

    const res = await handler(
      readEvent(pairKey, { lastReadSentAt: 100, lastReadMessageId: 'msg-1' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');
    expect(mocks.docSend.mock.calls[0][0].input.Key).toEqual({ pk, sk });
  });
});
