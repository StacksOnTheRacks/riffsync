import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { defaultStaleRoomMs } from './room-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type CatalogEpisodeReferences = {
  rooms: number;
  lists: number;
};

async function countScanMatches(
  tableName: string,
  filterExpression: string,
  expressionAttributeValues: Record<string, unknown>,
): Promise<number> {
  const out = await client.send(
    new ScanCommand({
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      Select: 'COUNT',
    }),
  );
  return typeof out.Count === 'number' ? out.Count : 0;
}

/** True when a room row still references an episode in an active watch party window. */
export function isActiveCatalogEpisodeRoomReference(
  row: Record<string, unknown>,
  episodeId: string,
  nowMs: number,
  staleMs: number = defaultStaleRoomMs(),
): boolean {
  if (row.catalogEpisodeId !== episodeId) return false;
  const lastActivityAt = row.lastActivityAt;
  if (typeof lastActivityAt !== 'number' || !Number.isFinite(lastActivityAt)) {
    return false;
  }
  return lastActivityAt > nowMs - staleMs;
}

export async function countCatalogEpisodeReferences(
  episodeId: string,
  roomsTableName: string,
  listsTableName?: string,
  nowMs: number = Date.now(),
  staleMs: number = defaultStaleRoomMs(),
): Promise<CatalogEpisodeReferences> {
  const activeRoomCutoff = nowMs - staleMs;
  const rooms = await countScanMatches(
    roomsTableName,
    'catalogEpisodeId = :id AND lastActivityAt > :cutoff',
    { ':id': episodeId, ':cutoff': activeRoomCutoff },
  );
  const lists =
    listsTableName && listsTableName.length > 0
      ? await countScanMatches(listsTableName, 'catalogEpisodeId = :id', { ':id': episodeId })
      : 0;
  return { rooms, lists };
}

export async function catalogEpisodeExists(
  catalogTableName: string,
  episodeId: string,
): Promise<boolean> {
  const out = await client.send(
    new GetCommand({
      TableName: catalogTableName,
      Key: { id: episodeId },
    }),
  );
  return out.Item !== undefined;
}
