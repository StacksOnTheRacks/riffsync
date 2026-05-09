import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { TextEncoder } from 'node:util';

const encoder = new TextEncoder();

export function wsManagementClient(): ApiGatewayManagementApiClient {
  const endpoint = process.env.WS_MANAGEMENT_API_ENDPOINT;
  if (!endpoint) {
    throw new Error('Missing WS_MANAGEMENT_API_ENDPOINT');
  }
  return new ApiGatewayManagementApiClient({ endpoint });
}

export async function queryRoomPresenceItems(
  doc: DynamoDBDocumentClient,
  table: string,
  roomId: string,
): Promise<Record<string, unknown>[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: 'roomId = :r',
      ExpressionAttributeValues: { ':r': roomId },
      ConsistentRead: true,
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
  for (const it of await queryRoomPresenceItems(doc, table, roomId)) {
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
  roomPresenceTable?: string,
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
        const prior = roomPresenceTable
          ? await doc
              .send(
                new GetCommand({
                  TableName: connectionsTable,
                  Key: { connectionId: id },
                }),
              )
              .catch(() => undefined)
          : undefined;
        const roomId = typeof prior?.Item?.roomId === 'string' ? prior.Item.roomId : undefined;
        const presenceKey = typeof prior?.Item?.presenceKey === 'string' ? prior.Item.presenceKey : undefined;
        if (roomPresenceTable && roomId && presenceKey) {
          await doc
            .send(
              new DeleteCommand({
                TableName: roomPresenceTable,
                Key: { roomId, presenceKey },
              }),
            )
            .catch(() => undefined);
        }
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

/** Same rules as roster rows: explicit `displayName` from `$connect`, else `Guest (…)` from `sessionId`. */
export function presenceDisplayNameForSession(sessionId: string, displayNameAttr: unknown): string {
  if (typeof displayNameAttr === 'string' && displayNameAttr.trim() !== '') {
    return displayNameAttr.trim().slice(0, 48);
  }
  return guestLabelFallback(sessionId);
}

/** Collapse multiple connections that share `sessionId` (e.g. two tabs): host flag dominates; keep a stable label. */
export function rosterFromConnectionItems(items: readonly Record<string, unknown>[]): PresenceBroadcastMember[] {
  const merged = new Map<string, PresenceBroadcastMember>();

  for (const it of items) {
    const sessionId = typeof it.sessionId === 'string' ? it.sessionId : '';
    if (sessionId === '') continue;
    const isHostConn = typeof it.hostSub === 'string' && (it.hostSub as string).length > 0;
    let label = presenceDisplayNameForSession(sessionId, it.displayName);

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
  roomPresenceTable: string;
  roomId: string;
}): Promise<void> {
  const { doc, connectionsTable, roomPresenceTable, roomId } = params;

  try {
    const items = await queryRoomPresenceItems(doc, roomPresenceTable, roomId);
    const ids: string[] = [];
    for (const it of items) {
      const cid = it.connectionId;
      if (typeof cid === 'string') ids.push(cid);
    }

    const members = rosterFromConnectionItems(items);
    const buf = encoder.encode(JSON.stringify({ type: 'presence', roomId, members }));
    const mgmt = wsManagementClient();

    await postToConnections(mgmt, doc, connectionsTable, ids, buf, undefined, roomPresenceTable);
  } catch {
    console.warn(JSON.stringify({ riffsyncDiag: 'broadcast_presence_failed', roomIdHead: roomId.slice(0, 8) }));
  }
}

export async function broadcastRoomPresenceNow(params: {
  doc: DynamoDBDocumentClient;
  connectionsTable: string;
  roomPresenceTable: string;
  roomId: string;
}): Promise<void> {
  await broadcastRoomPresence(params);
}
