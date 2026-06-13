import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  queryRoomPresenceItems: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
  QueryCommand: vi.fn((input: unknown) => ({ input, kind: 'Query' })),
}));

vi.mock('./ws-shared', () => ({
  queryRoomPresenceItems: mocks.queryRoomPresenceItems,
}));

import {
  clearLobbyCleanupPending,
  defaultHostDisconnectGraceMs,
  hasHostPresence,
  markLobbyCleanupPendingIfLastHostGone,
  removeRoomFromPublicLobby,
  shouldExcludeFromLobby,
  shouldSweeperRemoveFromLobby,
} from './room-lobby-cleanup';

describe('room-lobby-cleanup pure helpers', () => {
  describe('defaultHostDisconnectGraceMs', () => {
    const prev = process.env.HOST_DISCONNECT_GRACE_MS;

    afterEach(() => {
      if (prev === undefined) delete process.env.HOST_DISCONNECT_GRACE_MS;
      else process.env.HOST_DISCONNECT_GRACE_MS = prev;
    });

    it('defaults to 90 seconds', () => {
      delete process.env.HOST_DISCONNECT_GRACE_MS;
      expect(defaultHostDisconnectGraceMs()).toBe(90_000);
    });

    it('reads env override', () => {
      process.env.HOST_DISCONNECT_GRACE_MS = '120000';
      expect(defaultHostDisconnectGraceMs()).toBe(120_000);
    });
  });

  describe('hasHostPresence', () => {
    it('returns true when any row has hostSub', () => {
      expect(hasHostPresence([{ sessionId: 's1', hostSub: 'host-1' }])).toBe(true);
    });

    it('returns false for guest-only presence', () => {
      expect(hasHostPresence([{ sessionId: 's1' }, { sessionId: 's2', fanSub: 'fan-1' }])).toBe(false);
    });
  });

  describe('shouldExcludeFromLobby', () => {
    it('excludes rows whose cleanup deadline has passed', () => {
      expect(shouldExcludeFromLobby({ lobbyCleanupAfter: 1_000 }, 1_000)).toBe(true);
      expect(shouldExcludeFromLobby({ lobbyCleanupAfter: 1_000 }, 999)).toBe(false);
    });

    it('keeps rows without cleanup deadline', () => {
      expect(shouldExcludeFromLobby({}, 1_000)).toBe(false);
    });
  });

  describe('shouldSweeperRemoveFromLobby', () => {
    it('removes expired cleanup-pending rows', () => {
      expect(shouldSweeperRemoveFromLobby({ lobbyCleanupAfter: 500 }, 500, 45 * 60 * 1000)).toBe(true);
    });

    it('removes stale activity rows', () => {
      const staleMs = 45 * 60 * 1000;
      const nowMs = 1_000_000;
      expect(
        shouldSweeperRemoveFromLobby({ lastActivityAt: nowMs - staleMs - 1 }, nowMs, staleMs),
      ).toBe(true);
    });

    it('keeps active rows within grace and stale windows', () => {
      const staleMs = 45 * 60 * 1000;
      const nowMs = 1_000_000;
      expect(
        shouldSweeperRemoveFromLobby(
          { lastActivityAt: nowMs - 1_000, lobbyCleanupAfter: nowMs + 60_000 },
          nowMs,
          staleMs,
        ),
      ).toBe(false);
    });
  });
});

describe('room-lobby-cleanup async helpers', () => {
  const doc = { send: mocks.docSend } as unknown as DynamoDBDocumentClient;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HOST_DISCONNECT_GRACE_MS;
  });

  it('markLobbyCleanupPendingIfLastHostGone skips non-host departures', async () => {
    await markLobbyCleanupPendingIfLastHostGone({
      doc,
      roomsTable: 'rooms',
      roomPresenceTable: 'presence',
      roomId: 'room-1',
      departingWasHost: false,
    });

    expect(mocks.queryRoomPresenceItems).not.toHaveBeenCalled();
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('markLobbyCleanupPendingIfLastHostGone skips when another host remains', async () => {
    mocks.queryRoomPresenceItems.mockResolvedValue([{ sessionId: 'host-tab', hostSub: 'host-1' }]);

    await markLobbyCleanupPendingIfLastHostGone({
      doc,
      roomsTable: 'rooms',
      roomPresenceTable: 'presence',
      roomId: 'room-1',
      departingWasHost: true,
    });

    expect(mocks.queryRoomPresenceItems).toHaveBeenCalled();
    expect(mocks.docSend).not.toHaveBeenCalled();
  });

  it('markLobbyCleanupPendingIfLastHostGone schedules cleanup when last host leaves', async () => {
    mocks.queryRoomPresenceItems.mockResolvedValue([]);
    mocks.docSend.mockResolvedValue({});

    const nowMs = 1_700_000_000_000;
    await markLobbyCleanupPendingIfLastHostGone({
      doc,
      roomsTable: 'rooms',
      roomPresenceTable: 'presence',
      roomId: 'room-1',
      departingWasHost: true,
      nowMs,
    });

    expect(mocks.docSend).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'Update',
        input: expect.objectContaining({
          TableName: 'rooms',
          Key: { roomId: 'room-1' },
          ExpressionAttributeValues: expect.objectContaining({
            ':lca': nowMs + 90_000,
            ':hld': nowMs,
            ':public': 'public',
          }),
        }),
      }),
    );
  });

  it('clearLobbyCleanupPending removes pending fields', async () => {
    mocks.docSend.mockResolvedValue({});
    await clearLobbyCleanupPending({ doc, roomsTable: 'rooms', roomId: 'room-1' });

    expect(mocks.docSend).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'Update',
        input: expect.objectContaining({
          UpdateExpression: 'REMOVE #lca, #hld',
        }),
      }),
    );
  });

  it('removeRoomFromPublicLobby removes lobby index and cleanup fields', async () => {
    mocks.docSend.mockResolvedValue({});
    await removeRoomFromPublicLobby({ doc, roomsTable: 'rooms', roomId: 'room-1' });

    expect(mocks.docSend).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'Update',
        input: expect.objectContaining({
          UpdateExpression: 'REMOVE #lpk, #lsk, #lca, #hld',
        }),
      }),
    );
  });
});
