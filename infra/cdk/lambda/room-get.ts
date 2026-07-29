import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { readCatalogPlaybackHost } from './catalog-room-playback-gate';
import { parseRoomMode, type RoomMode } from './room-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export function readRoomMode(row: Record<string, unknown>): RoomMode {
  return parseRoomMode(row.roomMode) ?? 'theater';
}

export function readAvDisabled(row: Record<string, unknown>): boolean {
  return row.avDisabled === true;
}

export function readBroadcastCaptureActive(row: Record<string, unknown>): boolean {
  return row.broadcastCaptureActive === true;
}

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
  const displayTitle =
    typeof row.displayTitle === 'string' && row.displayTitle.trim() !== '' ? row.displayTitle.trim() : undefined;
  const playbackHost = readCatalogPlaybackHost(row);
  const customPlaybackUrl =
    typeof row.customPlaybackUrl === 'string' ? row.customPlaybackUrl : null;
  const youtubeVideoId =
    typeof row.youtubeVideoId === 'string' && row.youtubeVideoId.trim() !== ''
      ? row.youtubeVideoId.trim()
      : undefined;
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      room: {
        roomId: row.roomId,
        hostSub: row.hostSub,
        catalogEpisodeId: row.catalogEpisodeId,
        playbackHost,
        customPlaybackUrl,
        ...(youtubeVideoId !== undefined ? { youtubeVideoId } : {}),
        ...(displayTitle !== undefined ? { displayTitle } : {}),
        playbackExpectation: row.playbackExpectation,
        visibility: row.visibility,
        lastActivityAt: row.lastActivityAt,
        version: row.version,
        roomMode: readRoomMode(row),
        avDisabled: readAvDisabled(row),
        broadcastCaptureActive: readBroadcastCaptureActive(row),
      },
    }),
  };
};
