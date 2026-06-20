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
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
  DeleteCommand: vi.fn((input: unknown) => ({ input, kind: 'Delete' })),
}));

vi.mock('./ws-shared', () => ({
  broadcastRoomPresence: vi.fn(),
  broadcastRoomPresenceNow: vi.fn(),
  postToConnections: vi.fn(),
  presenceDisplayNameForSession: vi.fn(),
  queryConnectionsForRoom: vi.fn(),
  resolveChatOutboundAvatarUrl: vi.fn(),
  updateRoomPresenceLastActiveAt: vi.fn(),
  wsManagementClient: vi.fn(),
}));

import { loadConnectionRow } from './ws-route';

describe('loadConnectionRow', () => {
  beforeEach(() => {
    mocks.docSend.mockReset();
  });

  it('uses consistent read and returns the row when present', async () => {
    mocks.docSend.mockResolvedValueOnce({
      Item: { roomId: 'room-1', sessionId: 'sess-1' },
    });

    const row = await loadConnectionRow('connections', 'conn-abc');

    expect(row).toEqual({ roomId: 'room-1', sessionId: 'sess-1' });
    expect(mocks.docSend).toHaveBeenCalledTimes(1);
    expect(mocks.docSend.mock.calls[0]?.[0]).toMatchObject({
      input: {
        TableName: 'connections',
        Key: { connectionId: 'conn-abc' },
        ConsistentRead: true,
      },
    });
  });

  it('retries briefly when the first consistent read misses the fresh $connect row', async () => {
    mocks.docSend
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Item: { roomId: 'room-1', sessionId: 'sess-1' } });

    const row = await loadConnectionRow('connections', 'conn-abc');

    expect(row).toEqual({ roomId: 'room-1', sessionId: 'sess-1' });
    expect(mocks.docSend).toHaveBeenCalledTimes(2);
  });
});
