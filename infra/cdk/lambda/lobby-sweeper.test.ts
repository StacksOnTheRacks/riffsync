import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  removeRoomFromPublicLobby: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  QueryCommand: vi.fn((input: unknown) => ({ input, kind: 'Query' })),
}));

vi.mock('./room-lobby-cleanup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./room-lobby-cleanup')>();
  return {
    ...actual,
    removeRoomFromPublicLobby: mocks.removeRoomFromPublicLobby,
  };
});

import { handler } from './lobby-sweeper';

describe('lobby-sweeper handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms-table';
    process.env.STALE_ROOM_MS = String(45 * 60 * 1000);
    mocks.removeRoomFromPublicLobby.mockResolvedValue(undefined);
  });

  it('removes expired cleanup-pending and stale lobby rows', async () => {
    const nowMs = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    mocks.docSend.mockResolvedValueOnce({
      Items: [
        {
          roomId: 'room-expired',
          lobbyCleanupAfter: nowMs - 1,
          lastActivityAt: nowMs,
        },
        {
          roomId: 'room-stale',
          lastActivityAt: nowMs - 46 * 60 * 1000,
        },
        {
          roomId: 'room-active',
          lastActivityAt: nowMs - 1_000,
          lobbyCleanupAfter: nowMs + 60_000,
        },
      ],
    });

    await handler({} as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], () => undefined);

    expect(mocks.removeRoomFromPublicLobby).toHaveBeenCalledTimes(2);
    expect(mocks.removeRoomFromPublicLobby).toHaveBeenCalledWith(
      expect.objectContaining({ roomsTable: 'rooms-table', roomId: 'room-expired' }),
    );
    expect(mocks.removeRoomFromPublicLobby).toHaveBeenCalledWith(
      expect.objectContaining({ roomsTable: 'rooms-table', roomId: 'room-stale' }),
    );
  });
});
