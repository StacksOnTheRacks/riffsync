import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
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

import { handler } from './lobby-get';

describe('lobby-get handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.STALE_ROOM_MS = String(45 * 60 * 1000);
  });

  it('excludes rooms whose host cleanup grace period has expired', async () => {
    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    mocks.docSend
      .mockResolvedValueOnce({
        Items: [
          {
            roomId: 'room-active',
            catalogEpisodeId: 'ep-1',
            lastActivityAt: nowMs - 1_000,
            lobbyCleanupAfter: nowMs + 60_000,
          },
          {
            roomId: 'room-expired',
            catalogEpisodeId: 'ep-2',
            lastActivityAt: nowMs - 1_000,
            lobbyCleanupAfter: nowMs - 1,
          },
        ],
      })
      .mockResolvedValueOnce({ Count: 0 })
      .mockResolvedValueOnce({ Count: 2 });

    const res = await handler({} as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], () => undefined);
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(String(res.body)) as { rooms: Array<{ roomId: string }> };
    expect(body.rooms.map((r) => r.roomId)).toEqual(['room-active']);
  });
});
