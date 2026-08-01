import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { projectEpisode } from './catalog-shared';
import { getLiveChannel, LIVE_SYSTEM_HOST_SUB } from './live-channels';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

  const slug = event.pathParameters?.slug ?? '';
  const channel = getLiveChannel(slug);
  if (!channel || !channel.enabled) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Live channel not found', code: 'live_channel_not_found' }) };
  }

  const cat = await client.send(
    new GetCommand({
      TableName: catalogTable,
      Key: { id: channel.catalogEpisodeId },
    }),
  );
  const row = cat.Item as Record<string, unknown> | undefined;
  if (!row) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: 'Live channel source episode missing',
        code: 'live_channel_episode_missing',
        catalogEpisodeId: channel.catalogEpisodeId,
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
      statusCode: 409,
      body: JSON.stringify({
        error: 'Bound catalog episode must use catalog live',
        code: 'live_channel_episode_wrong_catalog',
        catalogEpisodeId: channel.catalogEpisodeId,
      }),
    };
  }

  const youtubeVideoId = episode.youtubeVideoId?.trim() || null;
  const displayTitle =
    typeof episode.title === 'string' && episode.title.trim() !== ''
      ? episode.title.trim()
      : channel.defaultTitle;

  await ensureSystemLiveRoom({
    roomsTable,
    roomId: channel.roomId,
    catalogEpisodeId: channel.catalogEpisodeId,
    displayTitle,
    youtubeVideoId,
  });

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug: channel.slug,
      roomId: channel.roomId,
      catalogEpisodeId: channel.catalogEpisodeId,
      enabled: channel.enabled,
      title: displayTitle,
      tagline: episode.tagline,
      posterImageUrl: episode.posterImageUrl,
      backdropImageUrl: episode.backdropImageUrl,
      youtubeVideoId,
      youtubeWatchUrl: episode.youtubeWatchUrl,
      embedAllows: episode.embedAllows !== false,
      playbackHost: episode.playbackHost,
    }),
  };
};
