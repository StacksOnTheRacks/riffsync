import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  markLobbyCleanupPendingIfLastHostGone: vi.fn(),
  broadcastRoomPresenceNow: vi.fn(),
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

vi.mock('./ws-shared', () => ({
  broadcastRoomPresenceNow: mocks.broadcastRoomPresenceNow,
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
});
