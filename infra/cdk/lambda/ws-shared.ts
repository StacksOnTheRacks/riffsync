import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBDocumentClient, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { TextEncoder } from 'node:util';

const encoder = new TextEncoder();

export function wsManagementClient(): ApiGatewayManagementApiClient {
  const endpoint = process.env.WS_MANAGEMENT_API_ENDPOINT;
  if (!endpoint) {
    throw new Error('Missing WS_MANAGEMENT_API_ENDPOINT');
  }
  return new ApiGatewayManagementApiClient({ endpoint });
}

export async function queryRoomConnectionItems(
  doc: DynamoDBDocumentClient,
  table: string,
  roomId: string,
): Promise<Record<string, unknown>[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: table,
      IndexName: 'RoomConnectionsIndex',
      KeyConditionExpression: 'roomId = :r',
      ExpressionAttributeValues: { ':r': roomId },
    }),
  );
  return (out.Items ?? []) as Record<string, unknown>[];
}

export async function queryConnectionsForRoom(
  doc: DynamoDBDocumentClient,
  table: string,
  roomId: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (const it of await queryRoomConnectionItems(doc, table, roomId)) {
    const cid = it.connectionId;
    if (typeof cid === 'string') ids.push(cid);
  }
  return ids;
}

function isPostToConnectionGone(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'GoneException';
}

/** API Gateway rejects payloads over 128 KiB — keep fan-out payloads small client-side too. */
const MAX_WS_FANOUT_BYTES = 120 * 1024;

export async function postToConnections(
  client: ApiGatewayManagementApiClient,
  doc: DynamoDBDocumentClient,
  connectionsTable: string,
  ids: readonly string[],
  payload: Uint8Array,
  except?: string,
): Promise<void> {
  if (payload.byteLength > MAX_WS_FANOUT_BYTES) {
    console.warn(
      JSON.stringify({
        riffsyncDiag: 'post_fanout_skipped_payload_too_large',
        payloadBytes: payload.byteLength,
        connectionsCount: ids.length,
      }),
    );
    return;
  }
  for (const id of ids) {
    if (id === except) continue;
    try {
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: id,
          Data: payload,
        }),
      );
    } catch (err: unknown) {
      if (isPostToConnectionGone(err)) {
        await doc
          .send(
            new DeleteCommand({
              TableName: connectionsTable,
              Key: { connectionId: id },
            }),
          )
          .catch(() => undefined);
      } else {
        const name =
          typeof err === 'object' && err !== null && 'name' in err
            ? String((err as { name: unknown }).name)
            : 'unknown';
        const msg =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err);
        console.warn(JSON.stringify({ riffsyncDiag: 'post_to_connection_failed', targetTail: id.slice(-12), name, msg }));
      }
    }
  }
}

export type PresenceBroadcastMember = {
  sessionId: string;
  displayName: string;
  isHost: boolean;
};

function guestLabelFallback(sessionId: string): string {
  return sessionId.length > 8 ? `Guest (${sessionId.slice(0, 8)}…)` : 'Guest';
}

/** Collapse multiple connections that share `sessionId` (e.g. two tabs): host flag dominates; keep a stable label. */
export function rosterFromConnectionItems(items: readonly Record<string, unknown>[]): PresenceBroadcastMember[] {
  const merged = new Map<string, PresenceBroadcastMember>();

  for (const it of items) {
    const sessionId = typeof it.sessionId === 'string' ? it.sessionId : '';
    if (sessionId === '') continue;
    const isHostConn = typeof it.hostSub === 'string' && (it.hostSub as string).length > 0;
    let label =
      typeof it.displayName === 'string' && it.displayName.trim() !== ''
        ? it.displayName.trim().slice(0, 48)
        : guestLabelFallback(sessionId);

    const cur = merged.get(sessionId);
    if (!cur) {
      merged.set(sessionId, {
        sessionId,
        displayName: label,
        isHost: isHostConn,
      });
    } else {
      if (!isHostConn) label = cur.displayName || label;
      merged.set(sessionId, {
        sessionId,
        displayName: label,
        isHost: cur.isHost || isHostConn,
      });
    }
  }

  const list = [...merged.values()];
  list.sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  });
  return list;
}

/** Fan-out current room roster after connect/disconnect. */
export async function broadcastRoomPresence(params: {
  doc: DynamoDBDocumentClient;
  connectionsTable: string;
  roomId: string;
}): Promise<void> {
  const { doc, connectionsTable, roomId } = params;

  try {
    const items = await queryRoomConnectionItems(doc, connectionsTable, roomId);
    const ids: string[] = [];
    for (const it of items) {
      const cid = it.connectionId;
      if (typeof cid === 'string') ids.push(cid);
    }

    const members = rosterFromConnectionItems(items);
    const buf = encoder.encode(JSON.stringify({ type: 'presence', roomId, members }));
    const mgmt = wsManagementClient();

    await postToConnections(mgmt, doc, connectionsTable, ids, buf);
  } catch {
    console.warn(JSON.stringify({ riffsyncDiag: 'broadcast_presence_failed', roomIdHead: roomId.slice(0, 8) }));
  }
}
