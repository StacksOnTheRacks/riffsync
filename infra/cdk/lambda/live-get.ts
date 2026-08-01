import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { CATALOG_META_ID } from './catalog-meta';
import { projectEpisode, sortEpisodes, type CatalogEpisode } from './catalog-shared';
import { liveRoomIdForCatalogEpisodeId, LIVE_SYSTEM_HOST_SUB } from './live-channels';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function liveChannelPayload(episode: CatalogEpisode) {
  const youtubeVideoId = episode.youtubeVideoId?.trim() || null;
  const title =
    typeof episode.title === 'string' && episode.title.trim() !== ''
      ? episode.title.trim()
      : episode.id;
  return {
    slug: episode.id,
    path: `/live/${encodeURIComponent(episode.id)}`,
    roomId: liveRoomIdForCatalogEpisodeId(episode.id),
    catalogEpisodeId: episode.id,
    enabled: true,
    title,
    tagline: episode.tagline,
    posterImageUrl: episode.posterImageUrl,
    backdropImageUrl: episode.backdropImageUrl,
    youtubeVideoId,
    youtubeWatchUrl: episode.youtubeWatchUrl,
    embedAllows: episode.embedAllows !== false,
    playbackHost: episode.playbackHost,
  };
}

async function listLiveEpisodes(catalogTable: string): Promise<CatalogEpisode[]> {
  const entries: CatalogEpisode[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const out = await client.send(
      new ScanCommand({
        TableName: catalogTable,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const raw of out.Items ?? []) {
      const item = raw as Record<string, unknown>;
      if (item.id === CATALOG_META_ID) continue;
      const episode = projectEpisode(item);
      if (episode.catalog === 'live') entries.push(episode);
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);

  return sortEpisodes(entries);
}

async function ensureSystemLiveRoom(params: {
  roomsTable: string;
  roomId: string;
  catalogEpisodeId: string;
  displayTitle: string;
  youtubeVideoId: string | null;
}): Promise<void> {
  const { roomsTable, roomId, catalogEpisodeId, displayTitle, youtubeVideoId } = params;
  const now = Date.now();
  try {
    await client.send(
      new PutCommand({
        TableName: roomsTable,
        Item: {
          roomId,
          hostSub: LIVE_SYSTEM_HOST_SUB,
          catalogEpisodeId,
          playbackHost: 'youtube',
          customPlaybackUrl: null,
          ...(youtubeVideoId ? { youtubeVideoId } : {}),
          displayTitle,
          playbackExpectation: 'free',
          visibility: 'private',
          roomMode: 'theater',
          avDisabled: true,
          lastActivityAt: now,
          version: 1,
          createdAt: now,
          liveChannel: true,
        },
        ConditionExpression: 'attribute_not_exists(roomId)',
      }),
    );
  } catch (err) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
    if (name !== 'ConditionalCheckFailedException') {
      throw err;
    }
    // Room exists — refresh activity + catalog mirrors so staff episode edits apply.
    await client.send(
      new UpdateCommand({
        TableName: roomsTable,
        Key: { roomId },
        UpdateExpression:
          'SET catalogEpisodeId = :ep, displayTitle = :title, playbackHost = :ph, customPlaybackUrl = :cpu, lastActivityAt = :now'
          + (youtubeVideoId ? ', youtubeVideoId = :yid' : ' REMOVE youtubeVideoId'),
        ExpressionAttributeValues: {
          ':ep': catalogEpisodeId,
          ':title': displayTitle,
          ':ph': 'youtube',
          ':cpu': null,
          ':now': now,
          ...(youtubeVideoId ? { ':yid': youtubeVideoId } : {}),
        },
      }),
    );
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const catalogTable = process.env.CATALOG_TABLE_NAME;
  if (!roomsTable || !catalogTable) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing table env' }) };
  }

  const slug = event.pathParameters?.slug?.trim() ?? '';
  if (!slug) {
    const episodes = await listLiveEpisodes(catalogTable);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        version: 1,
        channels: episodes.map(liveChannelPayload),
      }),
    };
  }

  const cat = await client.send(
    new GetCommand({
      TableName: catalogTable,
      Key: { id: slug },
    }),
  );
  const row = cat.Item as Record<string, unknown> | undefined;
  if (!row) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: 'Live channel source episode missing',
        code: 'live_channel_episode_missing',
        catalogEpisodeId: slug,
      }),
    };
  }

  let episode;
  try {
    episode = projectEpisode(row);
  } catch {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Live channel source episode invalid', code: 'live_channel_episode_invalid' }),
    };
  }

  if (episode.catalog !== 'live') {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: 'Live channel not found',
        code: 'live_channel_not_found',
        catalogEpisodeId: slug,
      }),
    };
  }

  const channel = liveChannelPayload(episode);

  await ensureSystemLiveRoom({
    roomsTable,
    roomId: channel.roomId,
    catalogEpisodeId: channel.catalogEpisodeId,
    displayTitle: channel.title,
    youtubeVideoId: channel.youtubeVideoId,
  });

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(channel),
  };
};
