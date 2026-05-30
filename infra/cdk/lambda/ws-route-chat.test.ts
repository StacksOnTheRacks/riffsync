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

import { handler, isUuidMessageId } from './ws-route';

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
      return { Item: { hostSub: 'host-sub-1' } };
    }
    return {};
  });
}

describe('ws-route chat', () => {
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

  it('accepts valid uuid messageId and fans out chat', async () => {
    const body = JSON.stringify({
      action: 'chat',
      text: 'hi',
      messageId: '11111111-1111-4111-8111-111111111111',
    });

    const result = await handler(baseEvent({ routeKey: 'chat', body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });
    expect(mocks.postToConnections).toHaveBeenCalledTimes(1);

    const payload = mocks.postToConnections.mock.calls[0][4] as Uint8Array;
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      type: 'chat',
      roomId: 'room-1',
      sessionId: 'sess-1',
      displayName: 'Fan One',
      text: 'hi',
      messageId: '11111111-1111-4111-8111-111111111111',
    });
    expect(typeof parsed.ts).toBe('number');
  });

  it('returns 400 for missing messageId without fan-out', async () => {
    const body = JSON.stringify({ action: 'chat', text: 'hello' });
    const result = await handler(baseEvent({ body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 400, body: 'messageId must be a valid UUID' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 400 for blank messageId without fan-out', async () => {
    const body = JSON.stringify({ action: 'chat', text: 'hello', messageId: '   ' });
    const result = await handler(baseEvent({ body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 400, body: 'messageId must be a valid UUID' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed messageId without fan-out', async () => {
    const body = JSON.stringify({ action: 'chat', text: 'hello', messageId: 'not-a-uuid' });
    const result = await handler(baseEvent({ body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 400, body: 'messageId must be a valid UUID' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 403 without fanSub and does not fan-out', async () => {
    stubConnectedRoom({ fanSub: undefined });
    const body = JSON.stringify({
      action: 'chat',
      text: 'hi',
      messageId: '11111111-1111-4111-8111-111111111111',
    });
    const result = await handler(baseEvent({ body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 403, body: 'Fan JWT required for chat' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });

  it('returns 403 for blank fanSub', async () => {
    stubConnectedRoom({ fanSub: '   ' });
    const body = JSON.stringify({
      action: 'chat',
      text: 'hi',
      messageId: '11111111-1111-4111-8111-111111111111',
    });
    const result = await handler(baseEvent({ body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 403, body: 'Fan JWT required for chat' });
    expect(mocks.postToConnections).not.toHaveBeenCalled();
  });
});

describe('isUuidMessageId', () => {
  it('accepts canonical UUID format', () => {
    expect(isUuidMessageId('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isUuidMessageId('')).toBe(false);
    expect(isUuidMessageId('msg-123')).toBe(false);
    expect(isUuidMessageId('11111111-1111-4111-8111-11111111111')).toBe(false);
  });
});
