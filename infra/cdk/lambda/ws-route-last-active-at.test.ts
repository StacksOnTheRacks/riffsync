import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  queryConnectionsForRoom: vi.fn(),
  postToConnections: vi.fn(),
  wsManagementClient: vi.fn(),
  updateRoomPresenceLastActiveAt: vi.fn(),
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

import { handler } from './ws-route';

function baseEvent(overrides: {
  routeKey?: string;
  body?: string;
  connectionId?: string;
}): APIGatewayProxyWebsocketEventV2 {
  return {
    body: overrides.body,
    requestContext: {
      routeKey: overrides.routeKey ?? 'chat',
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
      return { Item: { hostSub: 'host-sub-1', lastActivityAt: 0 } };
    }
    return {};
  });
}

describe('ws-route lastActiveAt updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    mocks.wsManagementClient.mockReturnValue({ client: true });
    mocks.queryConnectionsForRoom.mockResolvedValue(['conn-abc']);
    mocks.postToConnections.mockResolvedValue(undefined);
    mocks.updateRoomPresenceLastActiveAt.mockResolvedValue(undefined);
    stubConnectedRoom();
  });

  it('updates lastActiveAt on ping before returning', async () => {
    const result = await handler(baseEvent({ routeKey: 'ping' }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.updateRoomPresenceLastActiveAt).toHaveBeenCalledWith(
      expect.anything(),
      'presence',
      'room-1',
      'sess-1#conn-abc',
      expect.any(Number),
    );
  });

  it('updates lastActiveAt on chat before fan-out', async () => {
    const body = JSON.stringify({
      action: 'chat',
      text: 'hi',
      messageId: '11111111-1111-4111-8111-111111111111',
    });
    await handler(baseEvent({ routeKey: 'chat', body }), {} as never, () => undefined);
    expect(mocks.updateRoomPresenceLastActiveAt).toHaveBeenCalledWith(
      expect.anything(),
      'presence',
      'room-1',
      'sess-1#conn-abc',
    );
    expect(mocks.postToConnections).toHaveBeenCalled();
    const updateOrder = mocks.updateRoomPresenceLastActiveAt.mock.invocationCallOrder[0];
    const fanOutOrder = mocks.postToConnections.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(fanOutOrder!);
  });

  it('updates lastActiveAt on chat_gif before fan-out', async () => {
    const body = JSON.stringify({
      action: 'chat_gif',
      messageId: '11111111-1111-4111-8111-111111111111',
      giphyId: 'gif-1',
      renditionUrl: 'https://media1.giphy.com/media/abc/giphy.gif',
    });
    await handler(baseEvent({ routeKey: 'chat_gif', body }), {} as never, () => undefined);
    expect(mocks.updateRoomPresenceLastActiveAt).toHaveBeenCalled();
  });

  it('updates lastActiveAt on react before fan-out', async () => {
    const body = JSON.stringify({
      action: 'react',
      messageId: 'msg-1',
      emoji: '👍',
      reactionAction: 'add',
    });
    await handler(baseEvent({ routeKey: 'react', body }), {} as never, () => undefined);
    expect(mocks.updateRoomPresenceLastActiveAt).toHaveBeenCalled();
  });
});
