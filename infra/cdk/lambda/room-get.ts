import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const tableName = process.env.ROOMS_TABLE_NAME;
  if (!tableName) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ROOMS_TABLE_NAME' }) };
  }

  const roomId = event.pathParameters?.roomId;
  if (!roomId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing roomId' }) };
  }

  const out = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { roomId },
    }),
  );

  if (!out.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };
  }

  const row = out.Item as Record<string, unknown>;
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      room: {
        roomId: row.roomId,
        hostSub: row.hostSub,
        catalogEpisodeId: row.catalogEpisodeId,
        youtubeVideoId: row.youtubeVideoId,
        playbackExpectation: row.playbackExpectation,
        visibility: row.visibility,
        lastActivityAt: row.lastActivityAt,
        version: row.version,
      },
    }),
  };
};
