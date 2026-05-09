import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { defaultStaleRoomMs, LOBBY_PARTITION } from './room-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const LOBBY_PAGE = 75;

async function countConnectionsForRoom(connectionsTable: string, roomId: string): Promise<number> {
  const out = await client.send(
    new QueryCommand({
      TableName: connectionsTable,
      KeyConditionExpression: 'roomId = :r',
      ExpressionAttributeValues: { ':r': roomId },
      ConsistentRead: true,
      Select: 'COUNT',
    }),
  );
  return typeof out.Count === 'number' ? out.Count : 0;
}

export const handler: APIGatewayProxyHandlerV2 = async (_event) => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const presenceTable = process.env.ROOM_PRESENCE_TABLE_NAME;
  if (!roomsTable || !presenceTable) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing table env' }) };
  }

  const staleMs = defaultStaleRoomMs();
  const cutoff = Date.now() - staleMs;

  const q = await client.send(
    new QueryCommand({
      TableName: roomsTable,
      IndexName: 'PublicLobbyIndex',
      KeyConditionExpression: 'lobbyPk = :pk',
      ExpressionAttributeValues: {
        ':pk': LOBBY_PARTITION,
        ':cutoff': cutoff,
      },
      FilterExpression: 'lastActivityAt > :cutoff',
      ScanIndexForward: false,
      Limit: LOBBY_PAGE,
    }),
  );

  const rows = (q.Items ?? []) as Record<string, unknown>[];

  const counts = await Promise.all(
    rows.map((r) => countConnectionsForRoom(presenceTable, String(r.roomId ?? ''))),
  );

  const roomsOut = rows.map((r, i) => {
    const catalogEpisodeId = String(r.catalogEpisodeId ?? '');
    const trimmedDisplay =
      typeof r.displayTitle === 'string' && r.displayTitle.trim() !== ''
        ? r.displayTitle.trim()
        : undefined;

    return {
      roomId: r.roomId,
      playbackExpectation: r.playbackExpectation,
      lastActivityAt: r.lastActivityAt,
      catalogEpisodeId,
      youtubeVideoId: r.youtubeVideoId,
      ...(trimmedDisplay !== undefined ? { displayTitle: trimmedDisplay } : {}),
      liveConnectionCount: counts[i] ?? 0,
    };
  });

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      version: 1,
      staleRoomMsHint: staleMs,
      cutoffActivityAfter: cutoff,
      rooms: roomsOut,
    }),
  };
};
