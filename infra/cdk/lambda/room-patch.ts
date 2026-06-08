import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  readAvDisabled,
  readBroadcastCaptureActive,
  readRoomMode,
} from './room-get';
import {
  lobbySortKey,
  LOBBY_PARTITION,
  normalizeRoomDisplayTitle,
  parsePlaybackExpectation,
  parseRoomMode,
  parseVisibility,
  ROOM_DISPLAY_TITLE_MAX_LEN,
  type RoomMode,
} from './room-shared';
import { requestSfuProducerTeardown } from './sfu-admin-teardown';

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

  const jwtSub = getJwtSub(event);
  if (!jwtSub) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const roomId = event.pathParameters?.roomId;
  if (!roomId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing roomId' }) };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const existing = await client.send(
    new GetCommand({
      TableName: roomsTable,
      Key: { roomId },
    }),
  );

  const room = existing.Item as Record<string, unknown> | undefined;
  if (!room || typeof room.hostSub !== 'string') {
    return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };
  }

  if (room.hostSub !== jwtSub) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden — not room host' }) };
  }

  const version = typeof room.version === 'number' ? room.version : 1;
  let visibility: 'public' | 'private' = parseVisibility(room.visibility) ?? 'private';

  if (typeof body.visibility === 'string') {
    const v = parseVisibility(body.visibility);
    if (!v) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'visibility must be "public" or "private"' }),
      };
    }
    visibility = v;
  }

  let catalogEpisodeId = String(room.catalogEpisodeId ?? '');
  let youtubeVideoId = String(room.youtubeVideoId ?? '');
  if (typeof body.catalogEpisodeId === 'string' && body.catalogEpisodeId !== catalogEpisodeId) {
    catalogEpisodeId = body.catalogEpisodeId;
    const cat = await client.send(
      new GetCommand({
        TableName: catalogTable,
        Key: { id: catalogEpisodeId },
      }),
    );
    const row = cat.Item as Record<string, unknown> | undefined;
    if (
      !row ||
      typeof row.youtubeVideoId !== 'string' ||
      (row.youtubeVideoId as string) === ''
    ) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: `Unknown catalog episode: ${catalogEpisodeId}` }),
      };
    }
    youtubeVideoId = row.youtubeVideoId as string;
  }

  let playbackExpectationPatch: ReturnType<typeof parsePlaybackExpectation> | undefined;
  if (typeof body.playbackExpectation === 'string') {
    const pe = parsePlaybackExpectation(body.playbackExpectation);
    if (!pe) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'playbackExpectation must be "free" or "premium"' }),
      };
    }
    playbackExpectationPatch = pe;
  }

  let broadcastCapturePatch: boolean | null | undefined;
  if (Object.prototype.hasOwnProperty.call(body, 'broadcastCaptureActive')) {
    if (body.broadcastCaptureActive === null) {
      broadcastCapturePatch = null;
    } else if (typeof body.broadcastCaptureActive === 'boolean') {
      broadcastCapturePatch = body.broadcastCaptureActive;
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'broadcastCaptureActive must be boolean or null' }),
      };
    }
  }

  let roomModePatch: RoomMode | undefined;
  let responseRoomMode = readRoomMode(room);
  if (Object.prototype.hasOwnProperty.call(body, 'roomMode')) {
    const rm = parseRoomMode(body.roomMode);
    if (!rm) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'roomMode must be "theater" or "videoChat"' }),
      };
    }
    roomModePatch = rm;
    responseRoomMode = rm;
  }

  let avDisabledPatch: boolean | undefined;
  let responseAvDisabled = readAvDisabled(room);
  if (Object.prototype.hasOwnProperty.call(body, 'avDisabled')) {
    if (typeof body.avDisabled !== 'boolean') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'avDisabled must be boolean' }),
      };
    }
    avDisabledPatch = body.avDisabled;
    responseAvDisabled = body.avDisabled;
  }

  let responseBroadcastCaptureActive = readBroadcastCaptureActive(room);
  if (broadcastCapturePatch !== undefined) {
    responseBroadcastCaptureActive = broadcastCapturePatch === true;
  }

  let storedDisplayTitle: string | undefined;
  if (Object.prototype.hasOwnProperty.call(body, 'displayTitle')) {
    const n = normalizeRoomDisplayTitle(body.displayTitle);
    if (!n) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `displayTitle must be a non-empty string at most ${ROOM_DISPLAY_TITLE_MAX_LEN} characters`,
        }),
      };
    }
    storedDisplayTitle = n;
  } else if (typeof room.displayTitle === 'string' && room.displayTitle.trim() !== '') {
    const t = room.displayTitle.trim();
    storedDisplayTitle =
      t.length > ROOM_DISPLAY_TITLE_MAX_LEN ? t.slice(0, ROOM_DISPLAY_TITLE_MAX_LEN) : t;
  }

  const now = Math.max(
    Date.now(),
    typeof room.lastActivityAt === 'number' ? room.lastActivityAt : 0,
  );

  const names: Record<string, string> = {
    '#host': 'hostSub',
    '#vat': 'lastActivityAt',
    '#ver': 'version',
    '#ceid': 'catalogEpisodeId',
    '#yt': 'youtubeVideoId',
    '#visibility': 'visibility',
    '#lpk': 'lobbyPk',
    '#lsk': 'lobbySk',
  };

  const values: Record<string, unknown> = {
    ':jwt': jwtSub,
    ':vcur': version,
    ':vat': now,
    ':vnext': version + 1,
    ':visibility': visibility,
    ':ceid': catalogEpisodeId,
    ':yt': youtubeVideoId,
  };

  const setParts = [
    '#ceid = :ceid',
    '#yt = :yt',
    '#visibility = :visibility',
    '#vat = :vat',
    '#ver = :vnext',
  ];

  if (playbackExpectationPatch !== undefined) {
    names['#pe'] = 'playbackExpectation';
    values[':pe'] = playbackExpectationPatch;
    setParts.push('#pe = :pe');
  }

  if (broadcastCapturePatch !== undefined) {
    names['#bc'] = 'broadcastCaptureActive';
    values[':bc'] = broadcastCapturePatch;
    setParts.push('#bc = :bc');
  }

  if (roomModePatch !== undefined) {
    names['#rm'] = 'roomMode';
    values[':rm'] = roomModePatch;
    setParts.push('#rm = :rm');
  }

  if (avDisabledPatch !== undefined) {
    names['#ad'] = 'avDisabled';
    values[':ad'] = avDisabledPatch;
    setParts.push('#ad = :ad');
  }

  if (storedDisplayTitle !== undefined) {
    names['#dt'] = 'displayTitle';
    values[':dt'] = storedDisplayTitle;
    setParts.push('#dt = :dt');
  }

  let updateExpression: string;

  if (visibility === 'public') {
    values[':lobbyPk'] = LOBBY_PARTITION;
    values[':lobbySk'] = lobbySortKey(now, roomId);
    setParts.push('#lpk = :lobbyPk', '#lsk = :lobbySk');
    updateExpression = `SET ${setParts.join(', ')}`;
  } else {
    updateExpression = `SET ${setParts.join(', ')} REMOVE #lpk, #lsk`;
  }

  try {
    await client.send(
      new UpdateCommand({
        TableName: roomsTable,
        Key: { roomId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: '#host = :jwt AND #ver = :vcur',
      }),
    );
  } catch (err: unknown) {
    const name =
      typeof err === 'object' && err !== null && 'name' in err
        ? String((err as { name: unknown }).name)
        : '';
    if (name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Conflict — stale version', version }),
      };
    }
    throw err;
  }

  if (avDisabledPatch === true) {
    const apiEnv = process.env.RIFFSYNC_API_ENV?.trim() || 'prod';
    const teardown = await requestSfuProducerTeardown({
      env: apiEnv,
      roomId,
      producerClass: 'participant_av',
    });
    if (teardown.ok) {
      console.log(
        JSON.stringify({
          riffsyncDiag: 'room_patch_sfu_teardown',
          roomId,
          closedCount: teardown.closedCount,
        }),
      );
    } else {
      console.error(
        JSON.stringify({
          riffsyncDiag: 'room_patch_sfu_teardown_failed',
          roomId,
          reason: teardown.reason,
          detail: teardown.detail,
        }),
      );
    }
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      ok: true,
      roomId,
      version: version + 1,
      catalogEpisodeId,
      youtubeVideoId,
      visibility,
      lastActivityAt: now,
      ...(storedDisplayTitle !== undefined ? { displayTitle: storedDisplayTitle } : {}),
      roomMode: responseRoomMode,
      avDisabled: responseAvDisabled,
      broadcastCaptureActive: responseBroadcastCaptureActive,
    }),
  };
};
