import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  queryConnectionsForRoom: vi.fn(),
  postToConnections: vi.fn(),
  wsManagementClient: vi.fn(),
  updateRoomPresenceLastActiveAt: vi.fn(),
  tryConsumeTypingRateLimit: vi.fn(),
  shouldCoalesceTypingStart: vi.fn(),
  recordTypingStartFanOut: vi.fn(),
  fanOutTyping: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
  DeleteCommand: vi.fn((input: unknown) => ({ input, kind: 'Delete' })),
}));

vi.mock('./ws-shared', () => ({
  broadcastRoomPresence: vi.fn(),
  broadcastRoomPresenceNow: vi.fn(),
  postToConnections: (...args: unknown[]) => mocks.postToConnections(...args),
  presenceDisplayNameForSession: (sessionId: string, displayNameAttr: unknown) =>
    typeof displayNameAttr === 'string' && displayNameAttr.trim() !== ''
      ? displayNameAttr.trim()
      : `Guest-${sessionId}`,
  queryConnectionsForRoom: (...args: unknown[]) => mocks.queryConnectionsForRoom(...args),
  resolveChatOutboundAvatarUrl: vi.fn(async () => undefined),
  updateRoomPresenceLastActiveAt: (...args: unknown[]) => mocks.updateRoomPresenceLastActiveAt(...args),
  wsManagementClient: () => mocks.wsManagementClient(),
}));

vi.mock('./ws-typing-shared', () => ({
  tryConsumeTypingRateLimit: (...args: unknown[]) => mocks.tryConsumeTypingRateLimit(...args),
  shouldCoalesceTypingStart: (...args: unknown[]) => mocks.shouldCoalesceTypingStart(...args),
  recordTypingStartFanOut: (...args: unknown[]) => mocks.recordTypingStartFanOut(...args),
  fanOutTyping: (...args: unknown[]) => mocks.fanOutTyping(...args),
}));

import { handler } from './ws-route';

function baseEvent(overrides: {
  routeKey?: string;
  body?: string;
  connectionId?: string;
}): APIGatewayProxyWebsocketEventV2 {
  return {
    body: overrides.body,
    requestContext: {
      routeKey: overrides.routeKey ?? 'typing_start',
      connectionId: overrides.connectionId ?? 'conn-abc',
      requestId: 'req-1',
      apiId: 'api-1',
      stage: 'dev',
      domainName: 'example.com',
      domainPrefix: 'example',
      eventType: 'MESSAGE',
      extendedRequestId: 'ext-1',
      requestTime: '01/Jan/2026:00:00:00 +0000',
      requestTimeEpoch: 0,
      messageDirection: 'IN',
      messageId: 'msg-1',
      connectedAt: 0,
    },
    isBase64Encoded: false,
  } as APIGatewayProxyWebsocketEventV2;
}

function stubConnectedRoom(connOverrides: Record<string, unknown> = {}) {
  mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: { TableName?: string } }) => {
    const table = cmd.input?.TableName;
    if (table === 'connections') {
      return {
        Item: {
          roomId: 'room-1',
          sessionId: 'sess-1',
          presenceKey: 'sess-1#conn-abc',
          displayName: 'Fan One',
          fanSub: 'fan-sub-1',
          ...connOverrides,
        },
      };
    }
    if (table === 'rooms') {
      return { Item: { hostSub: 'host-sub-1' } };
    }
    return {};
  });
}

describe('ws-route typing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    mocks.wsManagementClient.mockReturnValue({ client: true });
    mocks.queryConnectionsForRoom.mockResolvedValue(['conn-abc', 'conn-other']);
    mocks.postToConnections.mockResolvedValue(undefined);
    mocks.tryConsumeTypingRateLimit.mockResolvedValue(true);
    mocks.shouldCoalesceTypingStart.mockReturnValue(false);
    mocks.updateRoomPresenceLastActiveAt.mockResolvedValue(undefined);
    mocks.fanOutTyping.mockResolvedValue(undefined);
    stubConnectedRoom();
  });

  it('rejects typing_start for guests without fan JWT', async () => {
    stubConnectedRoom({ fanSub: undefined });
    const result = await handler(baseEvent({ routeKey: 'typing_start' }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 403, body: 'Fan JWT required for typing_start' });
    expect(mocks.fanOutTyping).not.toHaveBeenCalled();
  });

  it('fans out typing_start after lastActiveAt update', async () => {
    const result = await handler(baseEvent({ routeKey: 'typing_start' }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.updateRoomPresenceLastActiveAt).toHaveBeenCalledWith(
      expect.anything(),
      'presence',
      'room-1',
      'sess-1#conn-abc',
    );
    expect(mocks.fanOutTyping).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room-1',
        sessionId: 'sess-1',
        displayName: 'Fan One',
        action: 'start',
      }),
    );
    const updateOrder = mocks.updateRoomPresenceLastActiveAt.mock.invocationCallOrder[0];
    const fanOutOrder = mocks.fanOutTyping.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(fanOutOrder!);
  });

  it('silently drops typing_start when rate limit is exceeded', async () => {
    mocks.tryConsumeTypingRateLimit.mockResolvedValue(false);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await handler(baseEvent({ routeKey: 'typing_start' }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.fanOutTyping).not.toHaveBeenCalled();

    const throttledEmf = logSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse(call[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.TypingRouteThrottled === 1);
    expect(throttledEmf?.Route).toBe('typing_start');
  });

  it('coalesces duplicate typing_start within 1s without fan-out', async () => {
    mocks.shouldCoalesceTypingStart.mockReturnValue(true);
    const result = await handler(baseEvent({ routeKey: 'typing_start' }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.fanOutTyping).not.toHaveBeenCalled();
    expect(mocks.updateRoomPresenceLastActiveAt).not.toHaveBeenCalled();
  });

  it('fans out typing_stop without updating lastActiveAt', async () => {
    const result = await handler(baseEvent({ routeKey: 'typing_stop' }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.updateRoomPresenceLastActiveAt).not.toHaveBeenCalled();
    expect(mocks.fanOutTyping).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'stop',
      }),
    );
  });
});
