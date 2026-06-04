import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

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

export async function countCatalogEpisodeReferences(
  episodeId: string,
  roomsTableName: string,
  listsTableName?: string,
): Promise<CatalogEpisodeReferences> {
  const rooms = await countScanMatches(roomsTableName, 'catalogEpisodeId = :id', { ':id': episodeId });
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
