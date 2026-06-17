import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  broadcastRoomPresence: vi.fn(async () => undefined),
  postToConnections: vi.fn(async () => undefined),
  queryChatHistory: vi.fn(async () => ({
    messages: [
      {
        kind: 'text',
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: 'sess-1',
        text: 'hello',
        ts: 1000,
      },
    ],
    reactions: {
      '550e8400-e29b-41d4-a716-446655440000': {
        '👍': { count: 1, reactedByMe: true },
      },
    },
  })),
  persistChatTextMessage: vi.fn(async () => undefined),
  persistChatGifMessage: vi.fn(async () => undefined),
  persistReactionAdd: vi.fn(async () => undefined),
  persistReactionRemove: vi.fn(async () => undefined),
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

vi.mock('./room-chat-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./room-chat-shared')>();
  return {
    ...actual,
    queryChatHistory: (...args: unknown[]) => mocks.queryChatHistory(...args),
    persistChatTextMessage: (...args: unknown[]) => mocks.persistChatTextMessage(...args),
    persistChatGifMessage: (...args: unknown[]) => mocks.persistChatGifMessage(...args),
    persistReactionAdd: (...args: unknown[]) => mocks.persistReactionAdd(...args),
    persistReactionRemove: (...args: unknown[]) => mocks.persistReactionRemove(...args),
  };
});

vi.mock('./ws-shared', () => ({
  broadcastRoomPresence: (...args: unknown[]) => mocks.broadcastRoomPresence(...args),
  broadcastRoomPresenceNow: vi.fn(),
  postToConnections: (...args: unknown[]) => mocks.postToConnections(...args),
  presenceDisplayNameForSession: (sessionId: string, displayNameAttr: unknown) =>
    typeof displayNameAttr === 'string' && displayNameAttr.trim() !== ''
      ? displayNameAttr.trim()
      : `Guest-${sessionId}`,
  queryConnectionsForRoom: vi.fn(async () => ['conn-abc', 'conn-other']),
  resolveChatOutboundAvatarUrl: vi.fn(async () => undefined),
  updateRoomPresenceLastActiveAt: vi.fn(async () => undefined),
  wsManagementClient: vi.fn(() => ({ client: true })),
}));

import { handler } from './ws-route';

type DocCommand = { kind?: string; input?: Record<string, unknown> };

function baseEvent(overrides: { routeKey?: string; body?: string }): APIGatewayProxyWebsocketEventV2 {
  return {
    body: overrides.body,
    requestContext: {
      routeKey: overrides.routeKey ?? 'presence_request',
      connectionId: 'conn-abc',
      requestId: 'req-1',
      apiId: 'api-1',
      stage: 'dev',
      domainName: 'example.com',
      domainPrefix: 'example',
      eventType: 'MESSAGE',
      extendedRequestId: 'ext-1',
      requestTime: '01/Jan/2026:00:00:00 +0000',
      requestTimeEpoch: 0,
      messageId: 'msg-1',
      connectedAt: 0,
    },
    isBase64Encoded: false,
  } as APIGatewayProxyWebsocketEventV2;
}

function stubConnectedRoom(connOverrides: Record<string, unknown> = {}) {
  mocks.docSend.mockImplementation(async (cmd: DocCommand) => {
    const table = cmd.input?.TableName;
    if (cmd.kind === 'Get' && table === 'connections') {
      return {
        Item: {
          roomId: 'room-1',
          sessionId: 'sess-1',
          presenceKey: 'sess-1#conn-abc',
          displayName: 'Fan',
          fanSub: 'fan-sub-1',
          ...connOverrides,
        },
      };
    }
    if (cmd.kind === 'Get' && table === 'rooms') {
      return { Item: { hostSub: 'host-sub-1' } };
    }
    return {};
  });
}

describe('ws-route chat history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.ROOM_CHAT_TABLE_NAME = 'room-chat';
    process.env.CHAT_HISTORY_LIMIT = '50';
    process.env.CHAT_HISTORY_TTL_SECONDS = '86400';
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    stubConnectedRoom();
  });

  it('sends chat_history only to the requester on presence_request', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const result = await handler(
      baseEvent({ routeKey: 'presence_request', body: JSON.stringify({ action: 'presence_request' }) }),
      {} as never,
      () => undefined,
    );

    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.broadcastRoomPresence).toHaveBeenCalledTimes(1);
    expect(mocks.queryChatHistory).toHaveBeenCalledWith(
      expect.anything(),
      'room-chat',
      'room-1',
      'sess-1',
      50,
    );
    expect(mocks.postToConnections).toHaveBeenCalledTimes(1);
    const postArgs = mocks.postToConnections.mock.calls[0];
    expect(postArgs[3]).toEqual(['conn-abc']);
    const payload = JSON.parse(new TextDecoder().decode(postArgs[4] as Uint8Array));
    expect(payload.type).toBe('chat_history');
    expect(payload.roomId).toBe('room-1');
    expect(payload.messages).toHaveLength(1);
    expect(payload.reactions['550e8400-e29b-41d4-a716-446655440000']['👍']).toEqual({
      count: 1,
      reactedByMe: true,
    });

    logSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('persists chat text before fan-out', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const body = JSON.stringify({
      action: 'chat',
      text: 'hello',
      messageId: '550e8400-e29b-41d4-a716-446655440000',
    });

    const result = await handler(baseEvent({ routeKey: 'chat', body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.persistChatTextMessage).toHaveBeenCalledTimes(1);
    expect(mocks.postToConnections).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('persists reaction add before fan-out', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const body = JSON.stringify({
      action: 'react',
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      emoji: '👍',
      reactionAction: 'add',
    });

    const result = await handler(baseEvent({ routeKey: 'react', body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.persistReactionAdd).toHaveBeenCalledWith(
      expect.anything(),
      'room-chat',
      'room-1',
      '550e8400-e29b-41d4-a716-446655440000',
      '👍',
      'sess-1',
      86_400,
    );

    logSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
