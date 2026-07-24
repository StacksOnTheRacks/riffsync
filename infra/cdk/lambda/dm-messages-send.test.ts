import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  pushDmMessageToRecipient: vi.fn(),
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

vi.mock('./fan-dm-shared', () => ({
  pushDmMessageToRecipient: mocks.pushDmMessageToRecipient,
}));

import { handler } from './dm-messages-send';
import { directMessageSortKey, dmSendRateLimitKey, friendshipPairKey } from './dm-shared';
import { minuteBucketEpochMs } from './friends-shared';

function sendEvent(
  pairKey: string,
  body: Record<string, unknown>,
  opts?: { claims?: Record<string, unknown> },
): APIGatewayProxyEventV2 {
  const path = `/v1/dm/threads/${encodeURIComponent(pairKey)}/messages`;
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
      requestId: 'req-dm-send-1',
      routeKey: `POST ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: opts?.claims ? { jwt: { claims: opts.claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

describe('dm-messages-send handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    mocks.pushDmMessageToRecipient.mockReset();
    mocks.pushDmMessageToRecipient.mockResolvedValue(undefined);
    process.env.DM_THREADS_TABLE_NAME = 'DmThreads';
    process.env.DIRECT_MESSAGES_TABLE_NAME = 'DirectMessages';
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.FAN_CONNECTIONS_TABLE_NAME = 'FanConnections';
    process.env.FAN_PROFILES_TABLE_NAME = 'FanProfiles';
    process.env.DM_UNREAD_TABLE_NAME = 'DmUnread';
    process.env.DM_SEND_LIMIT_PER_MINUTE = '20';
  });

  it('returns 401 fan_auth_required without fan JWT', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(
      sendEvent(pairKey, { messageId: 'msg-1', kind: 'text', body: 'hello' }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(401);
    expect(JSON.parse((res as { body: string }).body).code).toBe('fan_auth_required');
  });

  it('returns 400 invalid_dm_body for empty body', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(
      sendEvent(pairKey, { messageId: 'msg-1', kind: 'text', body: '   ' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(400);
    expect(JSON.parse((res as { body: string }).body).code).toBe('invalid_dm_body');
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_dm_body for overlong body', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(
      sendEvent(
        pairKey,
        { messageId: 'msg-1', kind: 'text', body: 'x'.repeat(2001) },
        { claims: { sub: 'fan-a' } },
      ),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(400);
    expect(JSON.parse((res as { body: string }).body).code).toBe('invalid_dm_body');
  });

  it('returns 403 dm_not_member when caller is not in pairKey', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const res = await handler(
      sendEvent(pairKey, { messageId: 'msg-1', kind: 'text', body: 'hello' }, { claims: { sub: 'fan-c' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_not_member');
  });

  it('returns 403 friendship_not_active when friendship edge missing', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: undefined });

    const res = await handler(
      sendEvent(pairKey, { messageId: 'msg-1', kind: 'text', body: 'hello' }, { claims: { sub: 'fan-a' } }),
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
      sendEvent(pairKey, { messageId: 'msg-1', kind: 'text', body: 'hello' }, { claims: { sub: 'fan-a' } }),
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
      sendEvent(pairKey, { messageId: 'msg-1', kind: 'text', body: 'hello' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_thread_closed');
  });

  it('returns 429 rate_limited at send throttle', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const bucketMs = minuteBucketEpochMs();
    const { pk, sk } = dmSendRateLimitKey('fan-a', bucketMs);
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    mocks.docSend.mockRejectedValueOnce(err);

    const res = await handler(
      sendEvent(pairKey, { messageId: 'msg-1', kind: 'text', body: 'hello' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');
    expect(mocks.docSend.mock.calls[0][0].input.Key).toEqual({ pk, sk });
  });

  it('returns 403 on pre-write re-check when remove wins concurrent race', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const openThread = {
      Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'open', openedAt: 1, updatedAt: 2 },
    };
    const closedThread = {
      Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'closed', openedAt: 1, updatedAt: 2, closedAt: 3 },
    };
    mocks.docSend
      .mockResolvedValueOnce({}) // rate limit
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } }) // friendship (first access)
      .mockResolvedValueOnce(openThread) // thread (first access)
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } }) // friendship (pre-write)
      .mockResolvedValueOnce(closedThread); // thread closed on pre-write

    const res = await handler(
      sendEvent(pairKey, { messageId: 'msg-1', kind: 'text', body: 'hello' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(403);
    expect(JSON.parse((res as { body: string }).body).code).toBe('dm_thread_closed');
    expect(mocks.docSend.mock.calls.filter((c) => c[0]?.kind === 'Put')).toHaveLength(0);
  });

  it('returns 201, persists DirectMessage, and pushes to recipient fanSub only', async () => {
    const pairKey = friendshipPairKey('fan-a', 'fan-b');
    const openThread = {
      Item: { pairKey, subA: 'fan-a', subB: 'fan-b', status: 'open', openedAt: 1, updatedAt: 2 },
    };
    mocks.docSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce(openThread)
      .mockResolvedValueOnce({ Item: { pairKey, fanSub: 'fan-a' } })
      .mockResolvedValueOnce(openThread)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await handler(
      sendEvent(pairKey, { messageId: 'msg-uuid-1', kind: 'text', body: 'hello' }, { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(201);
    const body = JSON.parse((res as { body: string }).body);
    expect(body).toMatchObject({
      pairKey,
      messageId: 'msg-uuid-1',
      senderSub: 'fan-a',
      kind: 'text',
      body: 'hello',
    });
    expect(typeof body.sentAt).toBe('number');

    const putCall = mocks.docSend.mock.calls.find((call) => call[0].kind === 'Put');
    expect(putCall).toBeTruthy();
    const put = putCall![0].input as { TableName: string; Item: Record<string, unknown> };
    expect(put.TableName).toBe('DirectMessages');
    expect(put.Item.pairKey).toBe(pairKey);
    expect(put.Item.messageId).toBe('msg-uuid-1');
    expect(put.Item.senderSub).toBe('fan-a');
    expect(put.Item.sk).toBe(directMessageSortKey(body.sentAt, 'msg-uuid-1'));

    expect(mocks.pushDmMessageToRecipient).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientFanSub: 'fan-b',
        senderSub: 'fan-a',
        pairKey,
        messageId: 'msg-uuid-1',
        body: 'hello',
      }),
    );

    const unreadUpdate = mocks.docSend.mock.calls.find(
      (call) => call[0].kind === 'Update' && call[0].input.TableName === 'DmUnread',
    );
    expect(unreadUpdate).toBeTruthy();
    expect(unreadUpdate![0].input.Key).toEqual({ recipientSub: 'fan-b', pairKey });
  });
});
