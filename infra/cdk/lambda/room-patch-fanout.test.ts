import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsMocks = vi.hoisted(() => ({
  queryConnectionsForRoom: vi.fn(),
  postToConnections: vi.fn(),
  wsManagementClient: vi.fn(),
}));

vi.mock('./ws-shared', () => ({
  queryConnectionsForRoom: wsMocks.queryConnectionsForRoom,
  postToConnections: wsMocks.postToConnections,
  wsManagementClient: wsMocks.wsManagementClient,
}));

import { fanOutRoomPatchEnvelope, readHostSessionIdFromHeaders } from './room-patch-fanout';

describe('readHostSessionIdFromHeaders', () => {
  it('reads x-session-id case-insensitively', () => {
    expect(readHostSessionIdFromHeaders({ 'x-session-id': '  sess-1  ' })).toBe('sess-1');
    expect(readHostSessionIdFromHeaders({ 'X-Session-Id': 'sess-2' })).toBe('sess-2');
  });

  it('returns undefined when header missing or blank', () => {
    expect(readHostSessionIdFromHeaders({})).toBeUndefined();
    expect(readHostSessionIdFromHeaders({ 'x-session-id': '   ' })).toBeUndefined();
    expect(readHostSessionIdFromHeaders(undefined)).toBeUndefined();
  });
});

describe('fanOutRoomPatchEnvelope', () => {
  const doc = {} as DynamoDBDocumentClient;
  const mgmtClient = { kind: 'mgmt' };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONNECTIONS_TABLE_NAME = 'connections-table';
    process.env.ROOM_PRESENCE_TABLE_NAME = 'presence-table';
    process.env.WS_MANAGEMENT_API_ENDPOINT = 'https://mgmt.example/ws';
    wsMocks.queryConnectionsForRoom.mockResolvedValue(['conn-a', 'conn-b']);
    wsMocks.wsManagementClient.mockReturnValue(mgmtClient);
    wsMocks.postToConnections.mockResolvedValue(undefined);
  });

  it('queries room connections and posts encoded envelope with host sessionId', async () => {
    await fanOutRoomPatchEnvelope({
      doc,
      roomId: 'room-1',
      hostSessionId: 'host-sess',
      envelope: { type: 'av_disabled', avDisabled: true, ts: 1_700_000_000_000 },
    });

    expect(wsMocks.queryConnectionsForRoom).toHaveBeenCalledWith(doc, 'presence-table', 'room-1');
    expect(wsMocks.wsManagementClient).toHaveBeenCalledOnce();
    expect(wsMocks.postToConnections).toHaveBeenCalledOnce();

    const postArgs = wsMocks.postToConnections.mock.calls[0] as [
      unknown,
      DynamoDBDocumentClient,
      string,
      string[],
      Uint8Array,
      string | undefined,
      string,
    ];
    expect(postArgs[0]).toBe(mgmtClient);
    expect(postArgs[1]).toBe(doc);
    expect(postArgs[2]).toBe('connections-table');
    expect(postArgs[3]).toEqual(['conn-a', 'conn-b']);
    expect(postArgs[5]).toBeUndefined();
    expect(postArgs[6]).toBe('presence-table');

    const decoded = JSON.parse(new TextDecoder().decode(postArgs[4])) as Record<string, unknown>;
    expect(decoded).toMatchObject({
      type: 'av_disabled',
      roomId: 'room-1',
      sessionId: 'host-sess',
      avDisabled: true,
      ts: 1_700_000_000_000,
    });
  });

  it('omits sessionId when host session header was not provided', async () => {
    await fanOutRoomPatchEnvelope({
      doc,
      roomId: 'room-2',
      envelope: { type: 'room_mode', roomMode: 'videoChat', ts: 42 },
    });

    const postArgs = wsMocks.postToConnections.mock.calls[0] as [unknown, unknown, unknown, unknown, Uint8Array];
    const decoded = JSON.parse(new TextDecoder().decode(postArgs[4])) as Record<string, unknown>;
    expect(decoded.sessionId).toBeUndefined();
    expect(decoded.roomId).toBe('room-2');
  });

  it('throws when fan-out table env is missing', async () => {
    delete process.env.CONNECTIONS_TABLE_NAME;

    await expect(
      fanOutRoomPatchEnvelope({
        doc,
        roomId: 'room-1',
        envelope: { type: 'av_disabled', avDisabled: true },
      }),
    ).rejects.toThrow('Missing fan-out table env');
  });
});
