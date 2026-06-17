import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  queryConnectionsForRoom: vi.fn(),
  postToConnections: vi.fn(),
  wsManagementClient: vi.fn(),
  resolveChatOutboundAvatarUrl: vi.fn(),
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
  resolveChatOutboundAvatarUrl: (...args: unknown[]) => mocks.resolveChatOutboundAvatarUrl(...args),
  updateRoomPresenceLastActiveAt: vi.fn(async () => undefined),
  wsManagementClient: () => mocks.wsManagementClient(),
}));

import { handler } from './ws-route';

const VALID_MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
const VALID_GIPHY_URL = 'https://media.giphy.com/media/abc123/giphy.gif';

function baseEvent(overrides: { routeKey?: string; body?: string }): APIGatewayProxyWebsocketEventV2 {
  return {
    body: overrides.body,
    requestContext: {
      routeKey: overrides.routeKey ?? 'chat_gif',
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
      messageDirection: 'IN',
      messageId: 'msg-1',
      connectedAt: 0,
    },
    isBase64Encoded: false,
  } as APIGatewayProxyWebsocketEventV2;
}

function validBody(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    action: 'chat_gif',
    messageId: VALID_MESSAGE_ID,
    giphyId: 'abc123',
    renditionUrl: VALID_GIPHY_URL,
    ...extra,
  });
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

describe('ws-route chat_gif', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    mocks.wsManagementClient.mockReturnValue({ client: true });
    mocks.queryConnectionsForRoom.mockResolvedValue(['conn-abc', 'conn-other']);
    mocks.postToConnections.mockResolvedValue(undefined);
    mocks.resolveChatOutboundAvatarUrl.mockResolvedValue('https://cdn.example/avatar.png');
    stubConnectedRoom();
  });

  it('fans out chat_gif with enrichment for signed-in fan', async () => {
    const result = await handler(
      baseEvent({
        body: validBody({ title: '  wave  ', width: 480, height: 270 }),
      }),
      {} as never,
      () => undefined,
    );
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.postToConnections).toHaveBeenCalledTimes(1);

    const payload = mocks.postToConnections.mock.calls[0][4] as Uint8Array;
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      type: 'chat_gif',
      roomId: 'room-1',
      sessionId: 'sess-1',
      displayName: 'Fan One',
      messageId: VALID_MESSAGE_ID,
      giphyId: 'abc123',
      renditionUrl: VALID_GIPHY_URL,
      title: 'wave',
      width: 480,
      height: 270,
      avatarUrl: 'https://cdn.example/avatar.png',
    });
    expect(typeof parsed.ts).toBe('number');
  });

  it('returns 403 without fanSub and does not fan-out', async () => {
    stubConnectedRoom({ fanSub: undefined });
    const result = await handler(baseEvent({ body: validBody() }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 403, body: 'Fan JWT required for chat_gif' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 403 for blank fanSub', async () => {
    stubConnectedRoom({ fanSub: '   ' });
    const result = await handler(baseEvent({ body: validBody() }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 403, body: 'Fan JWT required for chat_gif' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid messageId', async () => {
    const result = await handler(
      baseEvent({ body: validBody({ messageId: 'not-a-uuid' }) }),
      {} as never,
      () => undefined,
    );
    expect(result).toEqual({ statusCode: 400, body: 'messageId must be a valid UUID' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 400 for missing giphyId', async () => {
    const result = await handler(
      baseEvent({
        body: JSON.stringify({
          action: 'chat_gif',
          messageId: VALID_MESSAGE_ID,
          renditionUrl: VALID_GIPHY_URL,
        }),
      }),
      {} as never,
      () => undefined,
    );
    expect(result).toEqual({ statusCode: 400, body: 'giphyId required' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 400 for non-HTTPS renditionUrl', async () => {
    const result = await handler(
      baseEvent({
        body: validBody({ renditionUrl: 'http://media.giphy.com/media/x/giphy.gif' }),
      }),
      {} as never,
      () => undefined,
    );
    expect(result).toEqual({ statusCode: 400, body: 'renditionUrl must be HTTPS Giphy CDN URL' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 400 for disallowed renditionUrl host', async () => {
    const result = await handler(
      baseEvent({
        body: validBody({ renditionUrl: 'https://evil.example/giphy.gif' }),
      }),
      {} as never,
      () => undefined,
    );
    expect(result).toEqual({ statusCode: 400, body: 'renditionUrl must be HTTPS Giphy CDN URL' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid width', async () => {
    const result = await handler(
      baseEvent({ body: validBody({ width: 0 }) }),
      {} as never,
      () => undefined,
    );
    expect(result).toEqual({ statusCode: 400, body: 'width must be a positive integer' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });
});
