import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  docSend: vi.fn(),
  postToConnections: vi.fn(async () => undefined),
  wsManagementClient: vi.fn(() => ({ client: true })),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mocks.docSend })),
  },
  QueryCommand: vi.fn((input: unknown) => ({ input, kind: 'Query' })),
  GetCommand: vi.fn((input: unknown) => ({ input, kind: 'Get' })),
  DeleteCommand: vi.fn((input: unknown) => ({ input, kind: 'Delete' })),
  UpdateCommand: vi.fn((input: unknown) => ({ input, kind: 'Update' })),
}));

vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: vi.fn(),
  PostToConnectionCommand: vi.fn((input: unknown) => input),
}));

vi.mock('./fan-profile-shared', () => ({
  batchAvatarUrlsByFanSub: vi.fn(async () => new Map()),
}));

vi.mock('./ws-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ws-shared')>();
  return {
    ...actual,
    postToConnections: (...args: unknown[]) => mocks.postToConnections(...args),
    wsManagementClient: () => mocks.wsManagementClient(),
  };
});

import { broadcastRoomPresence } from './ws-shared';

describe('broadcastRoomPresence EMF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    delete process.env.FAN_PROFILES_TABLE_NAME;
  });

  it('emits PresenceActiveFanOut when roster has an active member', async () => {
    const nowSec = 1_700_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowSec * 1000);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    mocks.docSend.mockResolvedValue({
      Items: [
        {
          connectionId: 'conn-a',
          sessionId: 'sess-a',
          displayName: 'Alice',
          lastActiveAt: nowSec - 30,
        },
      ],
    });

    await broadcastRoomPresence({
      doc: { send: mocks.docSend } as never,
      connectionsTable: 'connections',
      roomPresenceTable: 'presence',
      roomId: 'room-1',
    });

    const fanOutEmf = logSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse(call[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.PresenceActiveFanOut === 1);
    expect(fanOutEmf?.PresenceActiveFanOut).toBe(1);
    expect(fanOutEmf?.roomId).toBeUndefined();
    expect(fanOutEmf?.sessionId).toBeUndefined();
  });

  it('does not emit PresenceActiveFanOut when no member is active', async () => {
    const nowSec = 1_700_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(nowSec * 1000);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    mocks.docSend.mockResolvedValue({
      Items: [
        {
          connectionId: 'conn-a',
          sessionId: 'sess-a',
          displayName: 'Alice',
          lastActiveAt: nowSec - 500,
        },
      ],
    });

    await broadcastRoomPresence({
      doc: { send: mocks.docSend } as never,
      connectionsTable: 'connections',
      roomPresenceTable: 'presence',
      roomId: 'room-1',
    });

    const fanOutEmf = logSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse(call[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.PresenceActiveFanOut === 1);
    expect(fanOutEmf).toBeUndefined();
  });
});
