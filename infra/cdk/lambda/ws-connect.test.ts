import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  maintainPublicLobbyOnHostConnect: vi.fn(),
  broadcastRoomPresenceNow: vi.fn(),
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
  TransactWriteCommand: vi.fn((input: unknown) => ({ input, kind: 'TransactWrite' })),
}));

vi.mock('./cognito-jwt', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

vi.mock('./room-lobby-cleanup', () => ({
  maintainPublicLobbyOnHostConnect: mocks.maintainPublicLobbyOnHostConnect,
}));

vi.mock('./ws-shared', () => ({
  broadcastRoomPresenceNow: mocks.broadcastRoomPresenceNow,
  presenceDisplayNameForSession: (sessionId: string, displayNameAttr: unknown) =>
    typeof displayNameAttr === 'string' && displayNameAttr.trim() !== ''
      ? displayNameAttr.trim()
      : `Guest-${sessionId}`,
}));

vi.mock('./ws-chat-system-shared', () => ({
  isWithinJoinReconnectCooldown: vi.fn(async () => false),
  fanOutChatSystem: vi.fn(async () => undefined),
}));

import { handler } from './ws-connect';

describe('ws-connect handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    mocks.docSend.mockResolvedValue({});
    mocks.verifyAccessToken.mockResolvedValue({ sub: 'host-sub-1' });
    mocks.maintainPublicLobbyOnHostConnect.mockResolvedValue(undefined);
    mocks.broadcastRoomPresenceNow.mockResolvedValue(undefined);
  });

  it('maintains public lobby index when the host reconnects', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Item: { hostSub: 'host-sub-1', visibility: 'public' },
    });

    await handler(
      {
        requestContext: { connectionId: 'conn-1' },
        queryStringParameters: {
          roomId: 'room-1',
          sessionId: 'sess-host',
          accessToken: 'jwt-token',
        },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.maintainPublicLobbyOnHostConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        roomsTable: 'rooms',
        roomId: 'room-1',
        room: expect.objectContaining({ hostSub: 'host-sub-1', visibility: 'public' }),
      }),
    );
    expect(mocks.broadcastRoomPresenceNow).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'room-1', except: 'conn-1' }),
    );

    const transact = mocks.docSend.mock.calls.find(
      (call) => (call[0] as { kind?: string }).kind === 'TransactWrite',
    )?.[0] as { input?: { TransactItems?: Array<{ Put?: { Item?: Record<string, unknown> } }> } };
    const connPut = transact?.input?.TransactItems?.[0]?.Put?.Item;
    const presencePut = transact?.input?.TransactItems?.[1]?.Put?.Item;
    expect(connPut?.hostSub).toBe('host-sub-1');
    expect(presencePut?.hostSub).toBe('host-sub-1');
    expect(presencePut?.lastActiveAt).toEqual(expect.any(Number));
    expect(presencePut?.fanSub).toBe('host-sub-1');
    expect(presencePut?.fanSubRoomSk).toBe('room-1#sess-host#conn-1');
  });

  it('does not maintain lobby cleanup for guest connections', async () => {
    mocks.verifyAccessToken.mockResolvedValue(null);
    mocks.docSend.mockResolvedValueOnce({
      Item: { hostSub: 'host-sub-1' },
    });

    await handler(
      {
        requestContext: { connectionId: 'conn-1' },
        queryStringParameters: {
          roomId: 'room-1',
          sessionId: 'sess-guest',
        },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.maintainPublicLobbyOnHostConnect).not.toHaveBeenCalled();

    const transact = mocks.docSend.mock.calls.find(
      (call) => (call[0] as { kind?: string }).kind === 'TransactWrite',
    )?.[0] as { input?: { TransactItems?: Array<{ Put?: { Item?: Record<string, unknown> } }> } };
    const presencePut = transact?.input?.TransactItems?.[1]?.Put?.Item;
    expect(presencePut?.lastActiveAt).toBeUndefined();
    expect(presencePut?.fanSub).toBeUndefined();
  });
});
