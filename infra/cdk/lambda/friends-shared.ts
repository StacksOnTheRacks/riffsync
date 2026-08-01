import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getJwtSub } from './fan-profile-shared';

export const FRIENDSHIP_REQUESTS_RECIPIENT_INDEX = 'RecipientSubIndex';
export const FRIENDSHIP_REQUESTS_REQUESTER_INDEX = 'RequesterSubIndex';
export const FRIENDSHIP_REQUESTS_PAIR_INDEX = 'PairKeyIndex';
export const FRIENDSHIPS_FAN_SUB_INDEX = 'FanSubIndex';

export const FRIEND_INVITE_LIMIT_PER_MINUTE = 10;
export const FRIEND_ACTION_LIMIT_PER_MINUTE = 30;
export const FRIEND_LIST_LIMIT_PER_MINUTE = 60;

export type FriendshipDenyCode =
  | 'cannot_friend_self'
  | 'fan_auth_required'
  | 'friend_request_not_recipient'
  | 'friend_request_not_requester'
  | 'friend_request_not_found'
  | 'friendship_not_found'
  | 'friendship_not_member'
  | 'already_friends'
  | 'friend_request_inbound_exists'
  | 'rate_limited'
  | 'invalid_request';

export type FriendshipRequestItem = {
  requestId: string;
  requesterSub: string;
  recipientSub: string;
  status: 'pending';
  pairKey: string;
  createdAt: number;
};

export type FriendshipMemberItem = {
  pairKey: string;
  fanSub: string;
  peerSub: string;
  fanSubA: string;
  fanSubB: string;
  createdAt: number;
};

export type PendingRequestWire = {
  requestId: string;
  requesterSub: string;
  recipientSub: string;
  createdAt: number;
  displayName?: string;
  avatarUrl?: string;
};

type JsonRecord = { [key: string]: unknown };

export function jsonResponse(statusCode: number, body: JsonRecord): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

export function emptyResponse(statusCode: number): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: '',
  };
}

export function deny(statusCode: number, code: FriendshipDenyCode, error: string): APIGatewayProxyResultV2 {
  return jsonResponse(statusCode, { error, code });
}

export function requireFanSub(
  event: Parameters<APIGatewayProxyHandlerV2>[0],
): { ok: true; fanSub: string } | { ok: false; response: APIGatewayProxyResultV2 } {
  const fanSub = getJwtSub(event);
  if (!fanSub) {
    return {
      ok: false,
      response: deny(401, 'fan_auth_required', 'Fan authentication required'),
    };
  }
  return { ok: true, fanSub };
}

/** Canonical unordered pair key: min(subA,subB)#max(subA,subB). */
export function friendshipPairKey(subA: string, subB: string): string {
  return subA < subB ? `${subA}#${subB}` : `${subB}#${subA}`;
}

export function splitPairKey(pairKey: string): { fanSubA: string; fanSubB: string } | null {
  const i = pairKey.indexOf('#');
  if (i <= 0 || i === pairKey.length - 1) return null;
  const fanSubA = pairKey.slice(0, i);
  const fanSubB = pairKey.slice(i + 1);
  if (!fanSubA || !fanSubB || fanSubA.includes('#') || fanSubA >= fanSubB) return null;
  return { fanSubA, fanSubB };
}

export function toPendingWire(
  item: FriendshipRequestItem,
  profile?: { displayName: string; avatarUrl?: string },
): PendingRequestWire {
  const wire: PendingRequestWire = {
    requestId: item.requestId,
    requesterSub: item.requesterSub,
    recipientSub: item.recipientSub,
    createdAt: item.createdAt,
  };
  if (profile) {
    wire.displayName = profile.displayName;
    if (profile.avatarUrl) {
      wire.avatarUrl = profile.avatarUrl;
    }
  }
  return wire;
}

export function parseFriendshipRequestItem(raw: Record<string, unknown> | undefined): FriendshipRequestItem | null {
  if (!raw) return null;
  const requestId = typeof raw.requestId === 'string' ? raw.requestId : '';
  const requesterSub = typeof raw.requesterSub === 'string' ? raw.requesterSub : '';
  const recipientSub = typeof raw.recipientSub === 'string' ? raw.recipientSub : '';
  const pairKey = typeof raw.pairKey === 'string' ? raw.pairKey : '';
  const status = raw.status === 'pending' ? 'pending' : null;
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : NaN;
  if (!requestId || !requesterSub || !recipientSub || !pairKey || !status || !Number.isFinite(createdAt)) {
    return null;
  }
  return { requestId, requesterSub, recipientSub, status, pairKey, createdAt };
}

export function minuteBucketEpochMs(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 60_000) * 60_000;
}

export function friendshipRateLimitKey(
  kind: 'invite' | 'action' | 'list',
  fanSub: string,
  bucketMs: number,
): { pk: string; sk: string } {
  return { pk: `friend-${kind}#${fanSub}`, sk: String(bucketMs) };
}

export async function enforceFriendshipRateLimit(
  doc: DynamoDBDocumentClient,
  tableName: string,
  kind: 'invite' | 'action' | 'list',
  fanSub: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const bucketMs = minuteBucketEpochMs(nowMs);
  const { pk, sk } = friendshipRateLimitKey(kind, fanSub, bucketMs);
  const expiresAt = Math.floor(nowMs / 1000) + 120;

  try {
    await doc.send(
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

export async function queryPendingByPairKey(
  doc: DynamoDBDocumentClient,
  tableName: string,
  pairKey: string,
): Promise<FriendshipRequestItem[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: FRIENDSHIP_REQUESTS_PAIR_INDEX,
      KeyConditionExpression: 'pairKey = :pairKey',
      ExpressionAttributeValues: { ':pairKey': pairKey },
    }),
  );
  const items: FriendshipRequestItem[] = [];
  for (const raw of out.Items ?? []) {
    const parsed = parseFriendshipRequestItem(raw as Record<string, unknown>);
    if (parsed) items.push(parsed);
  }
  return items;
}

export async function queryPendingByRole(
  doc: DynamoDBDocumentClient,
  tableName: string,
  indexName: string,
  keyName: 'recipientSub' | 'requesterSub',
  fanSub: string,
): Promise<FriendshipRequestItem[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: `${keyName} = :fanSub`,
      ExpressionAttributeValues: { ':fanSub': fanSub },
      ScanIndexForward: false,
    }),
  );
  const items: FriendshipRequestItem[] = [];
  for (const raw of out.Items ?? []) {
    const parsed = parseFriendshipRequestItem(raw as Record<string, unknown>);
    if (parsed) items.push(parsed);
  }
  return items;
}

export async function friendshipExists(
  doc: DynamoDBDocumentClient,
  tableName: string,
  pairKey: string,
): Promise<boolean> {
  const out = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pairKey = :pairKey',
      ExpressionAttributeValues: { ':pairKey': pairKey },
      Limit: 1,
      ProjectionExpression: 'pairKey',
    }),
  );
  return (out.Items?.length ?? 0) > 0;
}

export function parseFriendshipMemberItem(raw: Record<string, unknown> | undefined): FriendshipMemberItem | null {
  if (!raw) return null;
  const pairKey = typeof raw.pairKey === 'string' ? raw.pairKey : '';
  const fanSub = typeof raw.fanSub === 'string' ? raw.fanSub : '';
  const peerSub = typeof raw.peerSub === 'string' ? raw.peerSub : '';
  const fanSubA = typeof raw.fanSubA === 'string' ? raw.fanSubA : '';
  const fanSubB = typeof raw.fanSubB === 'string' ? raw.fanSubB : '';
  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : NaN;
  if (!pairKey || !fanSub || !peerSub || !fanSubA || !fanSubB || !Number.isFinite(createdAt)) {
    return null;
  }
  return { pairKey, fanSub, peerSub, fanSubA, fanSubB, createdAt };
}

export function friendshipMemberItems(
  pairKey: string,
  createdAt: number,
): [FriendshipMemberItem, FriendshipMemberItem] {
  const parts = splitPairKey(pairKey);
  if (!parts) {
    throw new Error(`Invalid pairKey: ${pairKey}`);
  }
  const { fanSubA, fanSubB } = parts;
  return [
    {
      pairKey,
      fanSub: fanSubA,
      peerSub: fanSubB,
      fanSubA,
      fanSubB,
      createdAt,
    },
    {
      pairKey,
      fanSub: fanSubB,
      peerSub: fanSubA,
      fanSubA,
      fanSubB,
      createdAt,
    },
  ];
}
