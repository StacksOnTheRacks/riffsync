import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  markLobbyCleanupPendingIfLastHostGone: vi.fn(),
  broadcastRoomPresenceNow: vi.fn(),
  recordFanDisconnectJoinCooldown: vi.fn(),
  fanOutChatSystem: vi.fn(),
  fanOutTyping: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  DeleteCommand: vi.fn((input: unknown) => ({ input, kind: 'Delete' })),
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
}));

vi.mock('./room-lobby-cleanup', () => ({
  markLobbyCleanupPendingIfLastHostGone: mocks.markLobbyCleanupPendingIfLastHostGone,
}));

vi.mock('./ws-chat-system-shared', () => ({
  recordFanDisconnectJoinCooldown: (...args: unknown[]) => mocks.recordFanDisconnectJoinCooldown(...args),
  fanOutChatSystem: (...args: unknown[]) => mocks.fanOutChatSystem(...args),
}));

vi.mock('./ws-typing-shared', () => ({
  fanOutTyping: (...args: unknown[]) => mocks.fanOutTyping(...args),
}));

vi.mock('./ws-shared', () => ({
  broadcastRoomPresenceNow: mocks.broadcastRoomPresenceNow,
  presenceDisplayNameForSession: (sessionId: string, displayNameAttr: unknown) =>
    typeof displayNameAttr === 'string' && displayNameAttr.trim() !== ''
      ? displayNameAttr.trim()
      : `Guest-${sessionId}`,
}));

import { handler } from './ws-disconnect';

describe('ws-disconnect handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONNECTIONS_TABLE_NAME = 'connections';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.ROOMS_TABLE_NAME = 'rooms';
    mocks.docSend.mockResolvedValue({});
    mocks.broadcastRoomPresenceNow.mockResolvedValue(undefined);
    mocks.markLobbyCleanupPendingIfLastHostGone.mockResolvedValue(undefined);
    mocks.recordFanDisconnectJoinCooldown.mockResolvedValue(undefined);
    mocks.fanOutChatSystem.mockResolvedValue(undefined);
    mocks.fanOutTyping.mockResolvedValue(undefined);
  });

  it('marks lobby cleanup pending when the departing host socket leaves', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Item: {
        roomId: 'room-1',
        presenceKey: 'sess#conn',
        hostSub: 'host-sub-1',
      },
    });

    await handler(
      {
        requestContext: { connectionId: 'conn-1' },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.markLobbyCleanupPendingIfLastHostGone).toHaveBeenCalledWith(
      expect.objectContaining({
        roomsTable: 'rooms',
        roomPresenceTable: 'presence',
        roomId: 'room-1',
        departingWasHost: true,
      }),
    );
  });

  it('does not mark cleanup pending for guest disconnects', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Item: {
        roomId: 'room-1',
        presenceKey: 'sess#conn',
      },
    });

    await handler(
      {
        requestContext: { connectionId: 'conn-1' },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.markLobbyCleanupPendingIfLastHostGone).toHaveBeenCalledWith(
      expect.objectContaining({ departingWasHost: false }),
    );
  });

  it('fans out leave and typing_stop for signed-in fan disconnects', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Item: {
        roomId: 'room-1',
        presenceKey: 'sess#conn',
        sessionId: 'sess-fan',
        fanSub: 'fan-sub-1',
        displayName: 'Alice',
      },
    });

    await handler(
      {
        requestContext: { connectionId: 'conn-1' },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.recordFanDisconnectJoinCooldown).toHaveBeenCalledWith(
      expect.anything(),
      'presence',
      'room-1',
      'fan-sub-1',
    );
    expect(mocks.fanOutChatSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room-1',
        sessionId: 'sess-fan',
        displayName: 'Alice',
        event: 'leave',
      }),
    );
    expect(mocks.fanOutTyping).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room-1',
        sessionId: 'sess-fan',
        action: 'stop',
      }),
    );
  });

  it('does not fan out leave for guest disconnects', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Item: {
        roomId: 'room-1',
        presenceKey: 'sess#conn',
        sessionId: 'sess-guest',
      },
    });

    await handler(
      {
        requestContext: { connectionId: 'conn-1' },
      } as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      () => undefined,
    );

    expect(mocks.fanOutChatSystem).not.toHaveBeenCalled();
    expect(mocks.recordFanDisconnectJoinCooldown).not.toHaveBeenCalled();
    expect(mocks.fanOutTyping).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-guest',
        action: 'stop',
      }),
    );
  });
});
