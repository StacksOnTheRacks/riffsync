import type { APIGatewayProxyEventV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  verifyAccessToken: vi.fn(),
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
  BatchGetCommand: vi.fn((input: unknown) => ({ input, kind: 'BatchGet' })),
  TransactWriteCommand: vi.fn((input: unknown) => ({ input, kind: 'TransactWrite' })),
}));

vi.mock('./cognito-jwt', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

import { handler as fanDmWsConnectHandler } from './fan-dm-ws-connect';
import { handler as friendsListHandler } from './friends-list';
import { handler as friendsRequestsHandler } from './friends-requests';
import { handler as friendsRemoveHandler } from './friends-remove';
import { handler as dmEnsureHandler } from './dm-thread-ensure';
import { handler as dmMessagesListHandler } from './dm-messages-list';
import { handler as dmMessagesSendHandler } from './dm-messages-send';
import { handler as dmThreadReadHandler } from './dm-thread-read';

const FAN_AUTH_REQUIRED_BODY = {
  error: 'Fan authentication required',
  code: 'fan_auth_required',
};

function httpEvent(
  method: string,
  path: string,
  opts?: {
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    pathParameters?: Record<string, string>;
  },
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: opts?.headers ?? {},
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
      requestId: 'req-fan-auth-gate-1',
      routeKey: `${method} ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

function wsConnectEvent(queryStringParameters?: Record<string, string>): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      connectionId: 'conn-guest-1',
    },
    queryStringParameters,
  } as APIGatewayProxyWebsocketEventV2;
}

describe('friends/DM fan auth gate matrix (#365)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.docSend.mockReset();
    mocks.verifyAccessToken.mockResolvedValue(null);
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.FRIENDSHIP_REQUESTS_TABLE_NAME = 'FriendshipRequests';
    process.env.FAN_PROFILES_TABLE_NAME = 'FanProfiles';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'RoomPresence';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.DM_UNREAD_TABLE_NAME = 'DmUnread';
    process.env.DM_THREADS_TABLE_NAME = 'DmThreads';
    process.env.DIRECT_MESSAGES_TABLE_NAME = 'DirectMessages';
    process.env.FAN_CONNECTIONS_TABLE_NAME = 'FanConnections';
    process.env.FRIEND_LIST_LIMIT_PER_MINUTE = '60';
    process.env.DM_READ_LIMIT_PER_MINUTE = '60';
    process.env.DM_SEND_LIMIT_PER_MINUTE = '20';
  });

  const guestHeaders = {
    'x-session-id': 'guest-session-only',
  };

  async function expectFanAuthRequired(res: unknown): Promise<void> {
    expect(res && typeof res === 'object' && 'statusCode' in res ? res.statusCode : 0).toBe(401);
    expect(JSON.parse((res as { body: string }).body)).toEqual(FAN_AUTH_REQUIRED_BODY);
    expect(mocks.docSend).not.toHaveBeenCalled();
  }

  it('GET /v1/friends rejects guest sessionId-only requests', async () => {
    await expectFanAuthRequired(await friendsListHandler(httpEvent('GET', '/v1/friends', { headers: guestHeaders }), {} as never, {} as never));
  });

  it('POST /v1/friends/requests rejects guest sessionId-only requests', async () => {
    await expectFanAuthRequired(
      await friendsRequestsHandler(
        httpEvent('POST', '/v1/friends/requests', {
          headers: guestHeaders,
          body: { recipientSub: 'fan-b' },
        }),
        {} as never,
        {} as never,
      ),
    );
  });

  it('DELETE /v1/friends/{pairKey} rejects guest sessionId-only requests', async () => {
    await expectFanAuthRequired(
      await friendsRemoveHandler(
        httpEvent('DELETE', '/v1/friends/a%23b', {
          headers: guestHeaders,
          pathParameters: { pairKey: 'a#b' },
        }),
        {} as never,
        {} as never,
      ),
    );
  });

  it('PUT /v1/dm/threads/{peerSub} rejects guest sessionId-only requests', async () => {
    await expectFanAuthRequired(
      await dmEnsureHandler(
        httpEvent('PUT', '/v1/dm/threads/fan-b', {
          headers: guestHeaders,
          pathParameters: { peerSub: 'fan-b' },
        }),
        {} as never,
        {} as never,
      ),
    );
  });

  it('GET /v1/dm/threads/{pairKey}/messages rejects guest sessionId-only requests', async () => {
    await expectFanAuthRequired(
      await dmMessagesListHandler(
        httpEvent('GET', '/v1/dm/threads/a%23b/messages', {
          headers: guestHeaders,
          pathParameters: { pairKey: 'a#b' },
        }),
        {} as never,
        {} as never,
      ),
    );
  });

  it('POST /v1/dm/threads/{pairKey}/messages rejects guest sessionId-only requests', async () => {
    await expectFanAuthRequired(
      await dmMessagesSendHandler(
        httpEvent('POST', '/v1/dm/threads/a%23b/messages', {
          headers: guestHeaders,
          pathParameters: { pairKey: 'a#b' },
          body: { messageId: 'm1', kind: 'text', body: 'hello' },
        }),
        {} as never,
        {} as never,
      ),
    );
  });

  it('POST /v1/dm/threads/{pairKey}/read rejects guest sessionId-only requests', async () => {
    await expectFanAuthRequired(
      await dmThreadReadHandler(
        httpEvent('POST', '/v1/dm/threads/a%23b/read', {
          headers: guestHeaders,
          pathParameters: { pairKey: 'a#b' },
          body: { lastReadSentAt: 1, lastReadMessageId: 'm1' },
        }),
        {} as never,
        {} as never,
      ),
    );
  });

  it('Fan DM WebSocket connect rejects guest sessionId-only query params', async () => {
    const res = await fanDmWsConnectHandler(
      wsConnectEvent({ sessionId: 'guest-session-only' }),
      {} as never,
      () => undefined,
    );
    expect(res.statusCode).toBe(401);
    expect(mocks.docSend).not.toHaveBeenCalled();
    expect(mocks.verifyAccessToken).toHaveBeenCalled();
  });

  it('Fan DM WebSocket connect rejects staff bearer at verifier', async () => {
    mocks.verifyAccessToken.mockResolvedValue(null);
    const res = await fanDmWsConnectHandler(
      wsConnectEvent({ accessToken: 'staff-jwt', sessionId: 'tab-1' }),
      {} as never,
      () => undefined,
    );
    expect(res.statusCode).toBe(401);
    expect(mocks.docSend).not.toHaveBeenCalled();
  });
});
