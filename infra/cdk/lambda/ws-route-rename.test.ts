import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  broadcastRoomPresenceNow: vi.fn(async () => undefined),
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
  broadcastRoomPresenceNow: (...args: unknown[]) => mocks.broadcastRoomPresenceNow(...args),
  postToConnections: vi.fn(),
  presenceDisplayNameForSession: (sessionId: string, displayNameAttr: unknown) =>
    typeof displayNameAttr === 'string' && displayNameAttr.trim() !== ''
      ? displayNameAttr.trim()
      : `Guest-${sessionId}`,
  queryConnectionsForRoom: vi.fn(async () => []),
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
      routeKey: overrides.routeKey ?? 'rename',
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

function stubConnectedRoom(connOverrides: Record<string, unknown> = {}) {
  mocks.docSend.mockImplementation(async (cmd: DocCommand) => {
    const table = cmd.input?.TableName;
    if (cmd.kind === 'Get' && table === 'connections') {
      return {
        Item: {
          roomId: 'room-1',
          sessionId: 'sess-1',
          presenceKey: 'sess-1#conn-abc',
          displayName: 'Old Name',
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

describe('ws-route rename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    stubConnectedRoom();
  });

  it('updates the connection and presence rows then rebroadcasts presence', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const body = JSON.stringify({ action: 'rename', displayName: '  New Name  ' });

    const result = await handler(baseEvent({ routeKey: 'rename', body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 200, body: 'OK' });

    const updateCalls = mocks.docSend.mock.calls
      .map((c) => c[0] as DocCommand)
      .filter((cmd) => cmd.kind === 'Update');
    expect(updateCalls).toHaveLength(2);

    const connUpdate = updateCalls.find((c) => c.input?.TableName === 'connections');
    const presUpdate = updateCalls.find((c) => c.input?.TableName === 'presence');
    expect(connUpdate?.input?.Key).toEqual({ connectionId: 'conn-abc' });
    expect(presUpdate?.input?.Key).toEqual({ roomId: 'room-1', presenceKey: 'sess-1#conn-abc' });
    for (const cmd of updateCalls) {
      const values = cmd.input?.ExpressionAttributeValues as Record<string, unknown>;
      expect(values[':dn']).toBe('New Name');
    }

    expect(mocks.broadcastRoomPresenceNow).toHaveBeenCalledTimes(1);
    logSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('returns 400 for a blank display name without touching presence', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const body = JSON.stringify({ action: 'rename', displayName: '   ' });

    const result = await handler(baseEvent({ routeKey: 'rename', body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 400, body: 'displayName required, max 48 chars' });

    const updateCalls = mocks.docSend.mock.calls
      .map((c) => c[0] as DocCommand)
      .filter((cmd) => cmd.kind === 'Update');
    expect(updateCalls).toHaveLength(0);
    expect(mocks.broadcastRoomPresenceNow).not.toHaveBeenCalled();
    logSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('returns 403 when the connection has no fan JWT', async () => {
    stubConnectedRoom({ fanSub: undefined });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const body = JSON.stringify({ action: 'rename', displayName: 'New Name' });

    const result = await handler(baseEvent({ routeKey: 'rename', body }), {} as never, () => undefined);
    expect(result).toEqual({ statusCode: 403, body: 'Fan JWT required for rename' });
    expect(mocks.broadcastRoomPresenceNow).not.toHaveBeenCalled();
    logSpy.mockRestore();
    infoSpy.mockRestore();
  });
});
