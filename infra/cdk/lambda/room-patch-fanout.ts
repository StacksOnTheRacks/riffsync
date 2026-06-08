import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { TextEncoder } from 'node:util';
import { postToConnections, queryConnectionsForRoom, wsManagementClient } from './ws-shared';

const encoder = new TextEncoder();

export function readHostSessionIdFromHeaders(
  headers: Record<string, string | undefined> | undefined,
): string | undefined {
  const raw = headers?.['x-session-id'] ?? headers?.['X-Session-Id'];
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || undefined;
}

export type RoomPatchFanoutEnvelope = Record<string, unknown> & {
  roomId: string;
  sessionId?: string;
};

/** Fan-out a room admin PATCH envelope to all WebSocket connections in the room. */
export async function fanOutRoomPatchEnvelope(params: {
  doc: DynamoDBDocumentClient;
  roomId: string;
  envelope: RoomPatchFanoutEnvelope;
  hostSessionId?: string;
}): Promise<void> {
  const connectionsTable = process.env.CONNECTIONS_TABLE_NAME;
  const roomPresenceTable = process.env.ROOM_PRESENCE_TABLE_NAME;
  if (!connectionsTable || !roomPresenceTable) {
    throw new Error('Missing fan-out table env');
  }

  const { doc, roomId, envelope, hostSessionId } = params;
  const payload: RoomPatchFanoutEnvelope = {
    ...envelope,
    roomId,
    ...(hostSessionId ? { sessionId: hostSessionId } : {}),
  };

  const connectionIds = await queryConnectionsForRoom(doc, roomPresenceTable, roomId);
  const mgmt = wsManagementClient();
  const buf = encoder.encode(JSON.stringify(payload));

  await postToConnections(mgmt, doc, connectionsTable, connectionIds, buf, undefined, roomPresenceTable);
}
