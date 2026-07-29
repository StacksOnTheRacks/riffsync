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
  BatchGetCommand: vi.fn((input: unknown) => ({ input, kind: 'BatchGet' })),
}));

import { handler } from './lobby-get';

describe('lobby-get handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ROOMS_TABLE_NAME = 'rooms';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence';
    process.env.FAN_PROFILES_TABLE_NAME = 'FanProfiles';
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
            hostSub: 'host-active',
            catalogEpisodeId: 'ep-1',
            lastActivityAt: nowMs - 1_000,
            lobbyCleanupAfter: nowMs + 60_000,
          },
          {
            roomId: 'room-expired',
            hostSub: 'host-expired',
            catalogEpisodeId: 'ep-2',
            lastActivityAt: nowMs - 1_000,
            lobbyCleanupAfter: nowMs - 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        Responses: {
          FanProfiles: [{ sub: 'host-active', displayName: 'Active Host' }],
        },
      })
      .mockResolvedValueOnce({ Count: 2 });

    const res = await handler({} as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], () => undefined);
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(String(res.body)) as {
      rooms: Array<{ roomId: string; hostDisplayName?: string; hostSub?: string }>;
    };
    expect(body.rooms.map((r) => r.roomId)).toEqual(['room-active']);
    expect(body.rooms[0]?.hostDisplayName).toBe('Active Host');
    expect(body.rooms[0]).not.toHaveProperty('hostSub');
  });

  it('omits rooms whose host lacks a FanProfiles displayName', async () => {
    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    mocks.docSend
      .mockResolvedValueOnce({
        Items: [
          {
            roomId: 'room-named',
            hostSub: 'host-named',
            catalogEpisodeId: 'ep-1',
            lastActivityAt: nowMs - 1_000,
          },
          {
            roomId: 'room-anonymous',
            hostSub: 'host-anonymous',
            catalogEpisodeId: 'ep-2',
            lastActivityAt: nowMs - 1_000,
          },
        ],
      })
      .mockResolvedValueOnce({
        Responses: {
          FanProfiles: [{ sub: 'host-named', displayName: 'Named Host' }],
        },
      })
      .mockResolvedValueOnce({ Count: 1 });

    const res = await handler({} as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], () => undefined);
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(String(res.body)) as { rooms: Array<{ roomId: string; hostDisplayName: string }> };
    expect(body.rooms).toEqual([
      expect.objectContaining({ roomId: 'room-named', hostDisplayName: 'Named Host' }),
    ]);
  });

  it('includes playbackHost on listed rooms', async () => {
    const nowMs = 1_700_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);

    mocks.docSend
      .mockResolvedValueOnce({
        Items: [
          {
            roomId: 'room-yt',
            hostSub: 'host-yt',
            catalogEpisodeId: 'ep-yt',
            playbackHost: 'youtube',
            youtubeVideoId: 'dQw4w9WgXcQ',
            lastActivityAt: nowMs - 1_000,
          },
          {
            roomId: 'room-custom',
            hostSub: 'host-custom',
            catalogEpisodeId: 'ep-custom',
            playbackHost: 'custom',
            customPlaybackUrl: 'https://example.com/watch/123',
            lastActivityAt: nowMs - 1_000,
          },
        ],
      })
      .mockResolvedValueOnce({
        Responses: {
          FanProfiles: [
            { sub: 'host-yt', displayName: 'YouTube Host' },
            { sub: 'host-custom', displayName: 'Custom Host' },
          ],
        },
      })
      .mockResolvedValueOnce({ Count: 1 })
      .mockResolvedValueOnce({ Count: 2 });

    const res = await handler({} as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], () => undefined);
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(String(res.body)) as {
      rooms: Array<Record<string, unknown>>;
    };
    expect(body.rooms).toEqual([
      expect.objectContaining({
        roomId: 'room-yt',
        playbackHost: 'youtube',
        youtubeVideoId: 'dQw4w9WgXcQ',
      }),
      expect.objectContaining({
        roomId: 'room-custom',
        playbackHost: 'custom',
      }),
    ]);
    expect(body.rooms[1]).not.toHaveProperty('youtubeVideoId');
  });
});
