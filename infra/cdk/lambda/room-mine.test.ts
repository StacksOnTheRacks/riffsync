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
}));

import {
  handler,
  mapMineRoomItem,
  queryHostedRoomsForSub,
  roomsMineRateLimitKey,
} from './room-mine';
import { HOST_SUB_ROOMS_INDEX } from './room-shared';
import { minuteBucketEpochMs } from './friends-shared';

function fanEvent(
  method: string,
  path: string,
  opts?: { claims?: Record<string, unknown>; query?: string; headers?: Record<string, string> },
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: opts?.query ?? '',
    headers: opts?.headers ?? {},
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
      requestId: 'req-rooms-mine-1',
      routeKey: `${method} ${path}`,
      stage: 'prod',
      time: '01/Jan/2025:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: opts?.claims ? { jwt: { claims: opts.claims } } : undefined,
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
  };
}

function roomItem(overrides: Record<string, unknown> = {}) {
  return {
    roomId: 'room-a',
    hostSub: 'fan-host',
    catalogEpisodeId: '101-the-crawling-eye',
    displayTitle: 'Movie Night',
    lastActivityAt: 5000,
    visibility: 'public',
    lobbyPk: 'PUBLIC',
    lobbySk: '00000000000000005000#room-a',
    version: 2,
    customPlaybackUrl: 'https://example.com/watch',
    ...overrides,
  };
}

describe('room-mine handler', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
    process.env.ROOMS_TABLE_NAME = 'Rooms';
    process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME = 'FriendshipRateLimits';
    process.env.ROOMS_MINE_LIMIT_PER_MINUTE = '60';
  });

  it('returns 401 fan_auth_required without fan JWT and does not query', async () => {
    const res = await handler(fanEvent('GET', '/v1/rooms/mine'), {} as never, {} as never);
    expect(res && typeof res === 'object' && 'statusCode' in res ? res.statusCode : 0).toBe(401);
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      error: 'Fan authentication required',
      code: 'fan_auth_required',
    });
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('queries HostSubRoomsIndex with JWT sub only and ignores client hostSub', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string }) => {
      if (cmd.kind === 'Update') return {};
      if (cmd.kind === 'Query') {
        return {
          Items: [roomItem({ roomId: 'room-owned', hostSub: 'fan-host' })],
        };
      }
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const res = await handler(
      fanEvent('GET', '/v1/rooms/mine', {
        claims: { sub: 'fan-host' },
        query: 'hostSub=other-host',
        headers: { hostSub: 'other-host' },
      }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(200);
    const queryCall = mocks.docSend.mock.calls.find(
      ([cmd]) => (cmd as { kind?: string }).kind === 'Query',
    )?.[0] as { input: Record<string, unknown> };
    expect(queryCall.input.IndexName).toBe(HOST_SUB_ROOMS_INDEX);
    expect(queryCall.input.ExpressionAttributeValues).toEqual({ ':hostSub': 'fan-host' });

    const body = JSON.parse((res as { body: string }).body) as { rooms: Record<string, unknown>[] };
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0]?.roomId).toBe('room-owned');
  });

  it('returns DTO keys only and omits live-* rooms', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string }) => {
      if (cmd.kind === 'Update') return {};
      if (cmd.kind === 'Query') {
        return {
          Items: [
            roomItem(),
            roomItem({ roomId: 'live-forever-live', hostSub: 'fan-host', visibility: 'public' }),
          ],
        };
      }
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const res = await handler(
      fanEvent('GET', '/v1/rooms/mine', { claims: { sub: 'fan-host' } }),
      {} as never,
      {} as never,
    );

    const body = JSON.parse((res as { body: string }).body) as { rooms: Record<string, unknown>[] };
    expect(body.rooms).toHaveLength(1);
    expect(Object.keys(body.rooms[0] ?? {}).sort()).toEqual([
      'catalogEpisodeId',
      'displayTitle',
      'lastActivityAt',
      'roomId',
      'visibility',
    ]);
    expect(body.rooms[0]).toEqual({
      roomId: 'room-a',
      displayTitle: 'Movie Night',
      catalogEpisodeId: '101-the-crawling-eye',
      lastActivityAt: 5000,
      visibility: 'public',
    });
  });

  it('returns empty rooms when host owns none', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string }) => {
      if (cmd.kind === 'Update') return {};
      if (cmd.kind === 'Query') return { Items: [] };
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const res = await handler(
      fanEvent('GET', '/v1/rooms/mine', { claims: { sub: 'fan-host' } }),
      {} as never,
      {} as never,
    );

    expect(JSON.parse((res as { body: string }).body)).toEqual({ rooms: [] });
  });

  it('includes public and private owned rooms', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string }) => {
      if (cmd.kind === 'Update') return {};
      if (cmd.kind === 'Query') {
        return {
          Items: [
            roomItem({ roomId: 'room-public', visibility: 'public', lastActivityAt: 8000 }),
            roomItem({ roomId: 'room-private', visibility: 'private', lastActivityAt: 7000 }),
          ],
        };
      }
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const res = await handler(
      fanEvent('GET', '/v1/rooms/mine', { claims: { sub: 'fan-host' } }),
      {} as never,
      {} as never,
    );

    const body = JSON.parse((res as { body: string }).body) as {
      rooms: Array<{ roomId: string; visibility: string }>;
    };
    expect(body.rooms.map((r) => r.roomId)).toEqual(['room-public', 'room-private']);
    expect(body.rooms.map((r) => r.visibility).sort()).toEqual(['private', 'public']);
  });

  it('returns 429 rate_limited at 60/min', async () => {
    mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: { UpdateExpression?: string } }) => {
      if (cmd.kind === 'Update') {
        const err = new Error('ConditionalCheckFailedException');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
      throw new Error(`unexpected ${cmd.kind}`);
    });

    const res = await handler(
      fanEvent('GET', '/v1/rooms/mine', { claims: { sub: 'fan-host' } }),
      {} as never,
      {} as never,
    );

    expect((res as { statusCode: number }).statusCode).toBe(429);
    expect(JSON.parse((res as { body: string }).body).code).toBe('rate_limited');
    expect(mocks.docSend.mock.calls.some(([cmd]) => (cmd as { kind?: string }).kind === 'Query')).toBe(
      false,
    );
  });
});

describe('queryHostedRoomsForSub', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
  });

  it('follows LastEvaluatedKey until complete and keeps desc order', async () => {
    mocks.docSend
      .mockResolvedValueOnce({
        Items: [roomItem({ roomId: 'room-1', lastActivityAt: 9000 })],
        LastEvaluatedKey: { hostSub: 'fan-host', lastActivityAt: 9000, roomId: 'room-1' },
      })
      .mockResolvedValueOnce({
        Items: [roomItem({ roomId: 'room-2', lastActivityAt: 8000 })],
      });

    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    const docClient = DynamoDBDocumentClient.from(new (await import('@aws-sdk/client-dynamodb')).DynamoDBClient({}));

    const rooms = await queryHostedRoomsForSub(docClient, 'Rooms', 'fan-host');
    expect(rooms.map((r) => r.roomId)).toEqual(['room-1', 'room-2']);
    expect(mocks.docSend).toHaveBeenCalledTimes(2);
  });
});

describe('mapMineRoomItem', () => {
  it('falls back displayTitle to catalogEpisodeId when blank', () => {
    expect(
      mapMineRoomItem(
        roomItem({ displayTitle: '   ', catalogEpisodeId: 'ep-fallback' }),
      ),
    ).toMatchObject({ displayTitle: 'ep-fallback' });
  });
});

describe('roomsMineRateLimitKey', () => {
  it('uses rooms-mine prefix separate from friends list quota', () => {
    const bucket = minuteBucketEpochMs(1_700_000_000_000);
    expect(roomsMineRateLimitKey('fan-a', bucket)).toEqual({
      pk: 'rooms-mine#fan-a',
      sk: String(bucket),
    });
  });
});
