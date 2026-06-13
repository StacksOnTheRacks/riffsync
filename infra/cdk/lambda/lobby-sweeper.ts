import type { ScheduledHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { defaultStaleRoomMs, LOBBY_PARTITION } from './room-shared';
import { removeRoomFromPublicLobby, shouldSweeperRemoveFromLobby } from './room-lobby-cleanup';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: ScheduledHandler = async () => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  if (!roomsTable) {
    throw new Error('Missing ROOMS_TABLE_NAME');
  }

  const nowMs = Date.now();
  const staleMs = defaultStaleRoomMs();
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let removedCount = 0;

  do {
    const q = await client.send(
      new QueryCommand({
        TableName: roomsTable,
        IndexName: 'PublicLobbyIndex',
        KeyConditionExpression: 'lobbyPk = :pk',
        ExpressionAttributeValues: { ':pk': LOBBY_PARTITION },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    const rows = (q.Items ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      const roomId = typeof row.roomId === 'string' ? row.roomId : undefined;
      if (!roomId) continue;
      if (shouldSweeperRemoveFromLobby(row, nowMs, staleMs)) {
        await removeRoomFromPublicLobby({ doc: client, roomsTable, roomId });
        removedCount += 1;
      }
    }

    lastEvaluatedKey = q.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  console.info(JSON.stringify({ riffsyncDiag: 'lobby_sweeper_complete', removedCount, nowMs }));
};
