import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { defaultStaleRoomMs } from './room-shared';
import { queryRoomPresenceItems } from './ws-shared';

/** Grace period before a hostless public room is hidden from the lobby (default 90s). */
export function defaultHostDisconnectGraceMs(): number {
  const raw = process.env.HOST_DISCONNECT_GRACE_MS;
  if (raw === undefined || raw === '') return 90 * 1000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 90 * 1000;
}

export function hasHostPresence(items: readonly Record<string, unknown>[]): boolean {
  return items.some((it) => typeof it.hostSub === 'string' && it.hostSub.length > 0);
}

/** True when a public lobby row should no longer appear in GET /v1/lobby results. */
export function shouldExcludeFromLobby(row: Record<string, unknown>, nowMs: number): boolean {
  const cleanupAfter = row.lobbyCleanupAfter;
  return typeof cleanupAfter === 'number' && cleanupAfter <= nowMs;
}

/** True when the sweeper should physically remove lobby index fields from the room document. */
export function shouldSweeperRemoveFromLobby(
  row: Record<string, unknown>,
  nowMs: number,
  staleMs: number = defaultStaleRoomMs(),
): boolean {
  if (shouldExcludeFromLobby(row, nowMs)) {
    return true;
  }
  const lastActivityAt = row.lastActivityAt;
  return typeof lastActivityAt === 'number' && lastActivityAt <= nowMs - staleMs;
}

export async function markLobbyCleanupPendingIfLastHostGone(params: {
  doc: DynamoDBDocumentClient;
  roomsTable: string;
  roomPresenceTable: string;
  roomId: string;
  departingWasHost: boolean;
  nowMs?: number;
}): Promise<void> {
  const { doc, roomsTable, roomPresenceTable, roomId, departingWasHost } = params;
  if (!departingWasHost) return;

  const remaining = await queryRoomPresenceItems(doc, roomPresenceTable, roomId);
  if (hasHostPresence(remaining)) return;

  const nowMs = params.nowMs ?? Date.now();
  const cleanupAfter = nowMs + defaultHostDisconnectGraceMs();

  await doc
    .send(
      new UpdateCommand({
        TableName: roomsTable,
        Key: { roomId },
        UpdateExpression: 'SET #lca = :lca, #hld = :hld',
        ConditionExpression: '#visibility = :public AND attribute_exists(#lpk)',
        ExpressionAttributeNames: {
          '#lca': 'lobbyCleanupAfter',
          '#hld': 'hostLastDisconnectedAt',
          '#visibility': 'visibility',
          '#lpk': 'lobbyPk',
        },
        ExpressionAttributeValues: {
          ':lca': cleanupAfter,
          ':hld': nowMs,
          ':public': 'public',
        },
      }),
    )
    .catch(() => undefined);
}

export async function clearLobbyCleanupPending(params: {
  doc: DynamoDBDocumentClient;
  roomsTable: string;
  roomId: string;
}): Promise<void> {
  const { doc, roomsTable, roomId } = params;
  await doc
    .send(
      new UpdateCommand({
        TableName: roomsTable,
        Key: { roomId },
        UpdateExpression: 'REMOVE #lca, #hld',
        ExpressionAttributeNames: {
          '#lca': 'lobbyCleanupAfter',
          '#hld': 'hostLastDisconnectedAt',
        },
      }),
    )
    .catch(() => undefined);
}

export async function removeRoomFromPublicLobby(params: {
  doc: DynamoDBDocumentClient;
  roomsTable: string;
  roomId: string;
}): Promise<void> {
  const { doc, roomsTable, roomId } = params;
  await doc
    .send(
      new UpdateCommand({
        TableName: roomsTable,
        Key: { roomId },
        UpdateExpression: 'REMOVE #lpk, #lsk, #lca, #hld',
        ExpressionAttributeNames: {
          '#lpk': 'lobbyPk',
          '#lsk': 'lobbySk',
          '#lca': 'lobbyCleanupAfter',
          '#hld': 'hostLastDisconnectedAt',
        },
      }),
    )
    .catch(() => undefined);
}
