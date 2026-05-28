import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  queryConnectionsForRoom: vi.fn(),
  postToConnections: vi.fn(),
  wsManagementClient: vi.fn(),
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
      routeKey: overrides.routeKey ?? 'react',
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

function stubConnectedRoom() {
  mocks.docSend.mockImplementation(async (cmd: { kind?: string; input?: { TableName?: string } }) => {
    const table = cmd.input?.TableName;
    if (table === 'connections') {
      return {
        Item: {
          roomId: 'room-1',
          sessionId: 'sess-1',
          presenceKey: 'sess-1#conn-abc',
          displayName: 'Fan One',
        },
      };
    }
    if (table === 'rooms') {
      return { Item: { hostSub: 'host-sub-1' } };
    }
    return {};
  });
}

describe('ws-route react', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    mocks.wsManagementClient.mockReturnValue({ client: true });
    mocks.queryConnectionsForRoom.mockResolvedValue(['conn-abc', 'conn-other']);
    mocks.postToConnections.mockResolvedValue(undefined);
    stubConnectedRoom();
  });

  it('fans out chat_reaction on valid react body', async () => {
    const body = JSON.stringify({
      action: 'react',
      messageId: '11111111-1111-4111-8111-111111111111',
      emoji: '👍',
      reactionAction: 'add',
    });
    const result = await handler(baseEvent({ routeKey: 'react', body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.postToConnections).toHaveBeenCalledTimes(1);
    const payload = mocks.postToConnections.mock.calls[0][4] as Uint8Array;
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      type: 'chat_reaction',
      roomId: 'room-1',
      messageId: '11111111-1111-4111-8111-111111111111',
      emoji: '👍',
      action: 'add',
      sessionId: 'sess-1',
      displayName: 'Fan One',
    });
    expect(typeof parsed.ts).toBe('number');
  });

  it('maps $default route when body.action is react', async () => {
    const body = JSON.stringify({
      action: 'react',
      messageId: 'msg-id-1',
      emoji: '🔥',
      reactionAction: 'remove',
    });
    const result = await handler(baseEvent({ routeKey: '$default', body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    const payload = mocks.postToConnections.mock.calls[0][4] as Uint8Array;
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    expect(parsed.action).toBe('remove');
  });

  it('returns 400 for missing messageId without fan-out', async () => {
    const body = JSON.stringify({ action: 'react', emoji: '👍', reactionAction: 'add' });
    const result = await handler(baseEvent({ body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 400, body: 'messageId required, max 64 chars' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid reactionAction without fan-out', async () => {
    const body = JSON.stringify({
      action: 'react',
      messageId: 'msg-1',
      emoji: '👍',
      reactionAction: 'toggle',
    });
    const result = await handler(baseEvent({ body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 400, body: 'reactionAction must be add or remove' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });
});
