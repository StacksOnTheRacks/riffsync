import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  isWithinJoinReconnectCooldown: vi.fn(),
  fanOutChatSystem: vi.fn(),
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
  verifyAccessToken: vi.fn(async () => ({ sub: 'fan-sub-1' })),
}));

vi.mock('./room-lobby-cleanup', () => ({
  maintainPublicLobbyOnHostConnect: vi.fn(async () => undefined),
}));

vi.mock('./ws-chat-system-shared', () => ({
  isWithinJoinReconnectCooldown: (...args: unknown[]) => mocks.isWithinJoinReconnectCooldown(...args),
  fanOutChatSystem: (...args: unknown[]) => mocks.fanOutChatSystem(...args),
}));

vi.mock('./ws-shared', () => ({
  broadcastRoomPresenceNow: vi.fn(async () => undefined),
  presenceDisplayNameForSession: (sessionId: string, displayNameAttr: unknown) =>
    typeof displayNameAttr === 'string' && displayNameAttr.trim() !== ''
      ? displayNameAttr.trim()
      : `Guest-${sessionId}`,
}));

import { handler } from './ws-connect';

describe('ws-connect chat_system join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    mocks.docSend.mockResolvedValue({ Item: { hostSub: 'host-sub-1' } });
    mocks.isWithinJoinReconnectCooldown.mockResolvedValue(false);
    mocks.fanOutChatSystem.mockResolvedValue(undefined);
  });

  it('fans out join line for signed-in fans when not in reconnect cooldown', async () => {
    await handler(
      {
        requestContext: { connectionId: 'conn-1' },
        queryStringParameters: {
          roomId: 'room-1',
          sessionId: 'sess-fan',
          displayName: 'Alice',
          accessToken: 'jwt-token',
        },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.fanOutChatSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room-1',
        sessionId: 'sess-fan',
        displayName: 'Alice',
        event: 'join',
        except: 'conn-1',
      }),
    );
  });

  it('suppresses join line for guests', async () => {
    const { verifyAccessToken } = await import('./cognito-jwt');
    vi.mocked(verifyAccessToken).mockResolvedValueOnce(null);

    await handler(
      {
        requestContext: { connectionId: 'conn-guest' },
        queryStringParameters: {
          roomId: 'room-1',
          sessionId: 'sess-guest',
        },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.fanOutChatSystem).not.toHaveBeenCalled();
  });

  it('suppresses join line during reconnect cooldown', async () => {
    mocks.isWithinJoinReconnectCooldown.mockResolvedValue(true);

    await handler(
      {
        requestContext: { connectionId: 'conn-2' },
        queryStringParameters: {
          roomId: 'room-1',
          sessionId: 'sess-fan',
          displayName: 'Alice',
          accessToken: 'jwt-token',
        },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.fanOutChatSystem).not.toHaveBeenCalled();
  });
});
