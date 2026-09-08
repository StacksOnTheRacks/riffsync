import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  deny,
  jsonResponse,
  minuteBucketEpochMs,
  requireFanSub,
} from './friends-shared';
import { HOST_SUB_ROOMS_INDEX, type RoomVisibility } from './room-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const ROOMS_MINE_LIMIT_PER_MINUTE = 60;

export type MineRoomWire = {
  roomId: string;
  displayTitle: string;
  catalogEpisodeId: string;
  lastActivityAt: number;
  visibility: RoomVisibility;
};

export function roomsMineRateLimitKey(fanSub: string, bucketMs: number): { pk: string; sk: string } {
  return { pk: `rooms-mine#${fanSub}`, sk: String(bucketMs) };
}

export async function enforceRoomsMineRateLimit(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  fanSub: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const bucketMs = minuteBucketEpochMs(nowMs);
  const { pk, sk } = roomsMineRateLimitKey(fanSub, bucketMs);
  const expiresAt = Math.floor(nowMs / 1000) + 120;

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk, sk },
        UpdateExpression: 'ADD requestCount :one SET expiresAt = :expiresAt',
        ConditionExpression: 'attribute_not_exists(requestCount) OR requestCount < :limit',
        ExpressionAttributeValues: {
          ':one': 1,
          ':limit': limit,
          ':expiresAt': expiresAt,
        },
      }),
    );
    return true;
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw e;
  }
}

function mineLimit(): number {
  const raw = process.env.ROOMS_MINE_LIMIT_PER_MINUTE;
  const n = raw !== undefined ? Number.parseInt(raw, 10) : ROOMS_MINE_LIMIT_PER_MINUTE;
  return Number.isFinite(n) && n > 0 ? n : ROOMS_MINE_LIMIT_PER_MINUTE;
}

function tables():
  | { ok: true; rooms: string; rateLimits: string }
  | { ok: false; response: APIGatewayProxyResultV2 } {
  const rooms = process.env.ROOMS_TABLE_NAME?.trim();
  const rateLimits = process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME?.trim();
  if (!rooms || !rateLimits) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Server misconfigured' }),
    };
  }
  return { ok: true, rooms, rateLimits };
}

export function mapMineRoomItem(raw: Record<string, unknown>): MineRoomWire | null {
  const roomId = typeof raw.roomId === 'string' ? raw.roomId : '';
  if (!roomId || roomId.startsWith('live-')) {
    return null;
  }

  const catalogEpisodeId = typeof raw.catalogEpisodeId === 'string' ? raw.catalogEpisodeId : '';
  const lastActivityAt =
    typeof raw.lastActivityAt === 'number' && Number.isFinite(raw.lastActivityAt)
      ? raw.lastActivityAt
      : NaN;
  const visibility = raw.visibility === 'public' || raw.visibility === 'private' ? raw.visibility : null;

  if (!catalogEpisodeId || !Number.isFinite(lastActivityAt) || !visibility) {
    return null;
  }

  const trimmedDisplay =
    typeof raw.displayTitle === 'string' && raw.displayTitle.trim() !== ''
      ? raw.displayTitle.trim()
      : catalogEpisodeId;

  return {
    roomId,
    displayTitle: trimmedDisplay,
    catalogEpisodeId,
    lastActivityAt,
    visibility,
  };
}

export async function queryHostedRoomsForSub(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  hostSub: string,
): Promise<MineRoomWire[]> {
  const rooms: MineRoomWire[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const out = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: HOST_SUB_ROOMS_INDEX,
        KeyConditionExpression: 'hostSub = :hostSub',
        ExpressionAttributeValues: { ':hostSub': hostSub },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const raw of out.Items ?? []) {
      const mapped = mapMineRoomItem(raw as Record<string, unknown>);
      if (mapped) {
        rooms.push(mapped);
      }
    }

    exclusiveStartKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return rooms;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const t = tables();
  if (!t.ok) return t.response;

  const auth = requireFanSub(event);
  if (!auth.ok) return auth.response;

  const method = event.requestContext.http.method.toUpperCase();
  const path = event.rawPath.replace(/\/+$/, '') || '/';
  if (method !== 'GET' || path !== '/v1/rooms/mine') {
    return jsonResponse(404, { error: 'Not found' });
  }

  const allowed = await enforceRoomsMineRateLimit(doc, t.rateLimits, auth.fanSub, mineLimit());
  if (!allowed) {
    return deny(429, 'rate_limited', 'Rooms mine rate limit exceeded');
  }

  const rooms = await queryHostedRoomsForSub(doc, t.rooms, auth.fanSub);
  return jsonResponse(200, { rooms });
};
