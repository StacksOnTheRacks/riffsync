import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { validateCatalogRowForRoomSeed } from './catalog-room-playback-gate';
import {
  initialDisplayTitleFromCatalog,
  lobbySortKey,
  LOBBY_PARTITION,
  parsePlaybackExpectation,
  parseVisibility,
} from './room-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface JwtClaims {
  sub?: string;
}

function getJwtSub(event: Parameters<APIGatewayProxyHandlerV2>[0]): string | undefined {
  const claims = (
    event.requestContext as unknown as {
      authorizer?: { jwt?: { claims?: JwtClaims } };
    }
  ).authorizer?.jwt?.claims;
  return typeof claims?.sub === 'string' ? claims.sub : undefined;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const catalogTable = process.env.CATALOG_TABLE_NAME;
  if (!roomsTable || !catalogTable) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing table env' }) };
  }

  const hostSub = getJwtSub(event);
  if (!hostSub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized — host JWT missing or invalid' }),
    };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const catalogEpisodeId = typeof body.catalogEpisodeId === 'string' ? body.catalogEpisodeId : '';
  if (!catalogEpisodeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'catalogEpisodeId is required (string)' }),
    };
  }

  const playbackExpectation = parsePlaybackExpectation(body.playbackExpectation);
  if (!playbackExpectation) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'playbackExpectation must be "free" or "premium"' }),
    };
  }

  const visibility = parseVisibility(body.visibility) ?? 'public';

  const cat = await client.send(
    new GetCommand({
      TableName: catalogTable,
      Key: { id: catalogEpisodeId },
    }),
  );
  const row = cat.Item as Record<string, unknown> | undefined;
  const playback = validateCatalogRowForRoomSeed(row, catalogEpisodeId);
  if (!playback.ok) {
    return {
      statusCode: playback.statusCode,
      body: JSON.stringify({ code: playback.code, error: playback.error }),
    };
  }

  const displayTitle = initialDisplayTitleFromCatalog({
    catalogEpisodeId,
    catalogTitle: row.title,
  });

  const now = Date.now();
  const roomId = crypto.randomUUID();
  const version = 1;

  const item: Record<string, unknown> = {
    roomId,
    hostSub,
    catalogEpisodeId,
    playbackHost: playback.playbackHost,
    customPlaybackUrl: playback.customPlaybackUrl,
    displayTitle,
    playbackExpectation,
    visibility,
    roomMode: 'theater',
    avDisabled: false,
    lastActivityAt: now,
    version,
    createdAt: now,
  };

  if (playback.youtubeVideoId !== undefined) {
    item.youtubeVideoId = playback.youtubeVideoId;
  }

  if (visibility === 'public') {
    item.lobbyPk = LOBBY_PARTITION;
    item.lobbySk = lobbySortKey(now, roomId);
  }

  await client.send(
    new PutCommand({
      TableName: roomsTable,
      Item: item,
      ConditionExpression: 'attribute_not_exists(roomId)',
    }),
  );

  return {
    statusCode: 201,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      roomId,
      hostSub,
      catalogEpisodeId,
      playbackHost: playback.playbackHost,
      customPlaybackUrl: playback.customPlaybackUrl,
      ...(playback.youtubeVideoId !== undefined ? { youtubeVideoId: playback.youtubeVideoId } : {}),
      displayTitle,
      playbackExpectation,
      visibility,
      roomMode: 'theater',
      avDisabled: false,
      lastActivityAt: now,
      version,
    }),
  };
};
