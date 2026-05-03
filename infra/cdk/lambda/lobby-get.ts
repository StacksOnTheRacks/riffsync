import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { defaultStaleRoomMs, LOBBY_PARTITION } from './room-shared';
import { projectEpisode } from './catalog-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const LOBBY_PAGE = 75;

export const handler: APIGatewayProxyHandlerV2 = async (_event) => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const catalogTable = process.env.CATALOG_TABLE_NAME;
  if (!roomsTable || !catalogTable) {
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
  const episodeIdSet = new Set<string>();
  for (const r of rows) {
    const id = r.catalogEpisodeId;
    if (typeof id === 'string' && id !== '') episodeIdSet.add(id);
  }
  const episodeIds = [...episodeIdSet];
  const catMap = new Map<string, Record<string, unknown>>();
  let remaining = [...episodeIds];
  while (remaining.length) {
    const batch = remaining.slice(0, 100);
    remaining = remaining.slice(100);
    const bg = await client.send(
      new BatchGetCommand({
        RequestItems: {
          [catalogTable]: { Keys: batch.map((id) => ({ id })) },
        },
      }),
    );
    for (const it of bg.Responses?.[catalogTable] ?? []) {
      const raw = it as Record<string, unknown>;
      const id = raw.id;
      if (typeof id === 'string') catMap.set(id, raw);
    }
  }

  const roomsOut = [];
  for (const r of rows) {
    const catalogEpisodeId = String(r.catalogEpisodeId ?? '');
    const catRow = catMap.get(catalogEpisodeId);
    let projection: Record<string, unknown> | null = null;
    if (catRow) {
      try {
        const ep = projectEpisode(catRow as Record<string, unknown>);
        projection = {
          id: ep.id,
          experimentNumber: ep.experimentNumber,
          title: ep.title,
          era: ep.era,
          posterImageUrl: ep.posterImageUrl,
          youtubeVideoId: ep.youtubeVideoId,
        };
      } catch {
        projection = null;
      }
    }
    roomsOut.push({
      roomId: r.roomId,
      playbackExpectation: r.playbackExpectation,
      lastActivityAt: r.lastActivityAt,
      catalogEpisodeId,
      youtubeVideoId: r.youtubeVideoId,
      ...(projection !== null ? { catalog: projection } : {}),
    });
  }

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
