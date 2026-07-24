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
  QueryCommand: vi.fn((input: unknown) => ({ input, kind: 'Query' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
  BatchGetCommand: vi.fn((input: unknown) => ({ input, kind: 'BatchGet' })),
}));

import { buildFriendListEntries, handler, sortFriendListEntries } from './friends-list';
import { friendshipPairKey, friendshipRateLimitKey, minuteBucketEpochMs } from './friends-shared';
import { ROOM_PRESENCE_FAN_SUB_INDEX } from './room-presence-shared';

function fanEvent(
  method: string,
  path: string,
  opts?: { claims?: Record<string, unknown> },
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
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
      requestId: 'req-friends-list-1',
      routeKey: `${method} ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: opts?.claims ? { jwt: { claims: opts.claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

function friendshipEdge(callerSub: string, peerSub: string, createdAt: number) {
  const pairKey = friendshipPairKey(callerSub, peerSub);
  const [fanSubA, fanSubB] = callerSub < peerSub ? [callerSub, peerSub] : [peerSub, callerSub];
  return {
    pairKey,
    fanSub: callerSub,
    peerSub,
    fanSubA,
    fanSubB,
    createdAt,
  };
}

describe('friends-list handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.FAN_PROFILES_TABLE_NAME = 'FanProfiles';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'RoomPresence';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.FRIEND_LIST_LIMIT_PER_MINUTE = '60';
  });

  it('returns 401 fan_auth_required without fan JWT', async () => {
    const res = await handler(fanEvent('GET', '/v1/friends'), {} as never, {} as never);
    expect(res && typeof res === 'object' && 'statusCode' in res ? res.statusCode : 0).toBe(401);
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      error: 'Fan authentication required',
      code: 'fan_auth_required',
    });
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('returns empty friends list when caller has no edges', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: { UpdateExpression?: string } }) => {
      if (cmd.kind === 'Update') return {};
      if (cmd.kind === 'Query') return { Items: [] };
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const res = await handler(
      fanEvent('GET', '/v1/friends', { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(200);
    expect(JSON.parse((res as { body: string }).body)).toEqual({ friends: [] });
  });

  it('returns friends with online true/false, profile fields, and sort order', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: Record<string, unknown> }) => {
      if (cmd.kind === 'Update') return {};
      if (cmd.kind === 'Query') {
        const input = cmd.input as {
          TableName?: string;
          IndexName?: string;
          ExpressionAttributeValues?: { ':fanSub'?: string };
        };
        if (input.TableName === 'Friendships') {
          return {
            Items: [
              friendshipEdge('fan-a', 'fan-z', 100),
              friendshipEdge('fan-a', 'fan-b', 200),
            ],
          };
        }
        if (input.IndexName === ROOM_PRESENCE_FAN_SUB_INDEX) {
          const peer = input.ExpressionAttributeValues?.[':fanSub'];
          return { Items: peer === 'fan-b' ? [{ fanSub: 'fan-b' }] : [] };
        }
        throw new Error('unexpected Query');
      }
      if (cmd.kind === 'BatchGet') {
        const input = cmd.input as {
          RequestItems?: { FanProfiles?: { Keys?: { sub: string }[] } };
        };
        const keys = input.RequestItems?.FanProfiles?.Keys ?? [];
        const items = keys.map((k) => {
          if (k.sub === 'fan-b') {
            return { sub: 'fan-b', displayName: 'Beta Fan', avatarUrl: 'https://cdn.example/b.png' };
          }
          if (k.sub === 'fan-z') {
            return { sub: 'fan-z', displayName: 'alpha peer' };
          }
          return { sub: k.sub };
        });
        return { Responses: { FanProfiles: items } };
      }
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const res = await handler(
      fanEvent('GET', '/v1/friends', { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(200);
    const body = JSON.parse((res as { body: string }).body);
    expect(body.friends).toEqual([
      {
        fanSub: 'fan-z',
        pairKey: friendshipPairKey('fan-a', 'fan-z'),
        displayName: 'alpha peer',
        online: false,
        createdAt: 100,
      },
      {
        fanSub: 'fan-b',
        pairKey: friendshipPairKey('fan-a', 'fan-b'),
        displayName: 'Beta Fan',
        avatarUrl: 'https://cdn.example/b.png',
        online: true,
        createdAt: 200,
      },
    ]);
  });

  it('uses displayName Friend when profile missing or empty', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: Record<string, unknown> }) => {
      if (cmd.kind === 'Update') return {};
      if (cmd.kind === 'Query') {
        const input = cmd.input as { TableName?: string };
        if (input.TableName === 'Friendships') {
          return { Items: [friendshipEdge('fan-a', 'fan-b', 1)] };
        }
        return { Items: [] };
      }
      if (cmd.kind === 'BatchGet') {
        return { Responses: { FanProfiles: [{ sub: 'fan-b', displayName: '   ' }] } };
      }
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const res = await handler(
      fanEvent('GET', '/v1/friends', { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    const body = JSON.parse((res as { body: string }).body);
    expect(body.friends[0].displayName).toBe('Friend');
    expect(body.friends[0].avatarUrl).toBeUndefined();
  });

  it('returns 429 rate_limited when list quota exceeded', async () => {
    const now = Date.now();
    const bucket = minuteBucketEpochMs(now);
    const { pk, sk } = friendshipRateLimitKey('list', 'fan-a', bucket);

    mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: Record<string, unknown> }) => {
      if (cmd.kind === 'Update') {
        const input = cmd.input as { Key?: { pk?: string; sk?: string } };
        if (input.Key?.pk === pk && input.Key?.sk === sk) {
          const err = new Error('ConditionalCheckFailedException');
          (err as { name: string }).name = 'ConditionalCheckFailedException';
          throw err;
        }
        return {};
      }
      throw new Error('should not query after rate limit');
    });

    const res = await handler(
      fanEvent('GET', '/v1/friends', { claims: { sub: 'fan-a' } }),
      {} as never,
      {} as never,
    );
    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');
  });
});

describe('sortFriendListEntries', () => {
  it('sorts case-insensitively by displayName then pairKey', () => {
    const sorted = sortFriendListEntries([
      {
        fanSub: 'z',
        pairKey: 'a#z',
        displayName: 'Beta',
        online: false,
        createdAt: 1,
      },
      {
        fanSub: 'b',
        pairKey: 'a#b',
        displayName: 'alpha',
        online: false,
        createdAt: 2,
      },
      {
        fanSub: 'c',
        pairKey: 'a#c',
        displayName: 'Alpha',
        online: false,
        createdAt: 3,
      },
    ]);
    expect(sorted.map((e) => e.displayName)).toEqual(['alpha', 'Alpha', 'Beta']);
  });
});

describe('buildFriendListEntries', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.FRIENDSHIPS_TABLE_NAME = 'Friendships';
    process.env.FAN_PROFILES_TABLE_NAME = 'FanProfiles';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'RoomPresence';
  });

  it('treats any RoomPresence row as online (multi-tab OR)', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: Record<string, unknown> }) => {
      if (cmd.kind === 'Query') {
        const input = cmd.input as { TableName?: string; IndexName?: string };
        if (input.TableName === 'Friendships') {
          return { Items: [friendshipEdge('fan-a', 'fan-b', 1)] };
        }
        if (input.IndexName === ROOM_PRESENCE_FAN_SUB_INDEX) {
          return { Items: [{ fanSub: 'fan-b' }] };
        }
      }
      if (cmd.kind === 'BatchGet') {
        return { Responses: { FanProfiles: [] } };
      }
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const entries = await buildFriendListEntries('fan-a', {
      friendships: 'Friendships',
      fanProfiles: 'FanProfiles',
      roomPresence: 'RoomPresence',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.online).toBe(true);
  });
});
