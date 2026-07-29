import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { batchDisplayNamesByFanSub } from './fan-profile-shared';
import { readCatalogPlaybackHost } from './catalog-room-playback-gate';
import { shouldExcludeFromLobby } from './room-lobby-cleanup';
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
  const fanProfilesTable = process.env.FAN_PROFILES_TABLE_NAME;
  if (!roomsTable || !presenceTable || !fanProfilesTable) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing table env' }) };
  }

  const staleMs = defaultStaleRoomMs();
  const nowMs = Date.now();
  const cutoff = nowMs - staleMs;

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

  const rows = ((q.Items ?? []) as Record<string, unknown>[]).filter(
    (row) => !shouldExcludeFromLobby(row, nowMs),
  );

  const hostSubs = rows
    .map((r) => (typeof r.hostSub === 'string' ? r.hostSub : ''))
    .filter((s) => s.length > 0);
  const displayNamesByHostSub = await batchDisplayNamesByFanSub(client, fanProfilesTable, hostSubs);

  const listedRows = rows.filter((r) => {
    const hostSub = typeof r.hostSub === 'string' ? r.hostSub : '';
    return hostSub.length > 0 && displayNamesByHostSub.has(hostSub);
  });

  const counts = await Promise.all(
    listedRows.map((r) => countConnectionsForRoom(presenceTable, String(r.roomId ?? ''))),
  );

  const roomsOut = listedRows.map((r, i) => {
    const hostSub = String(r.hostSub ?? '');
    const hostDisplayName = displayNamesByHostSub.get(hostSub) ?? '';
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
      playbackHost: readCatalogPlaybackHost(r),
      ...(typeof r.youtubeVideoId === 'string' && r.youtubeVideoId.trim() !== ''
        ? { youtubeVideoId: r.youtubeVideoId }
        : {}),
      hostDisplayName,
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
