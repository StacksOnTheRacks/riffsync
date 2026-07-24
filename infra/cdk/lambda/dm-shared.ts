import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  friendshipPairKey,
  jsonResponse,
  minuteBucketEpochMs,
  requireFanSub,
  splitPairKey,
} from './friends-shared';

export const DM_READ_LIMIT_PER_MINUTE = 60;
export const DM_HISTORY_DEFAULT_LIMIT = 50;
export const DM_HISTORY_MAX_LIMIT = 100;
export const DM_BODY_MAX_LEN = 2000;

export type DmDenyCode =
  | 'cannot_dm_self'
  | 'fan_auth_required'
  | 'friendship_not_active'
  | 'dm_not_member'
  | 'dm_thread_closed'
  | 'dm_thread_not_found'
  | 'rate_limited';

export type DmThreadItem = {
  pairKey: string;
  subA: string;
  subB: string;
  status: 'open' | 'closed';
  openedAt: number;
  updatedAt: number;
  closedAt?: number;
  reopenedAt?: number;
};

export type DirectMessageItem = {
  pairKey: string;
  sk: string;
  messageId: string;
  senderSub: string;
  kind: 'text';
  body: string;
  sentAt: number;
};

export type DirectMessageWire = {
  messageId: string;
  senderSub: string;
  kind: 'text';
  body: string;
  sentAt: number;
};

export type DmHistoryCursor = {
  sentAt: number;
  messageId: string;
};

export function dmDeny(statusCode: number, code: DmDenyCode, error: string): APIGatewayProxyResultV2 {
  return jsonResponse(statusCode, { error, code });
}

export { friendshipPairKey, jsonResponse, requireFanSub, splitPairKey };

export function isPairMember(pairKey: string, fanSub: string): boolean {
  const parts = splitPairKey(pairKey);
  if (!parts) return false;
  return fanSub === parts.fanSubA || fanSub === parts.fanSubB;
}

export function directMessageSortKey(sentAt: number, messageId: string): string {
  return `m#${String(sentAt).padStart(13, '0')}#${messageId}`;
}

export function encodeHistoryCursor(cursor: DmHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function decodeHistoryCursor(raw: string): DmHistoryCursor | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const padded = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const json = Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
    const parsed = JSON.parse(json) as { sentAt?: unknown; messageId?: unknown };
    const sentAt = typeof parsed.sentAt === 'number' && Number.isFinite(parsed.sentAt) ? parsed.sentAt : NaN;
    const messageId = typeof parsed.messageId === 'string' ? parsed.messageId.trim() : '';
    if (!Number.isFinite(sentAt) || !messageId) return null;
    return { sentAt, messageId };
  } catch {
    return null;
  }
}

export function parseDmThreadItem(raw: Record<string, unknown> | undefined): DmThreadItem | null {
  if (!raw) return null;
  const pairKey = typeof raw.pairKey === 'string' ? raw.pairKey : '';
  const subA = typeof raw.subA === 'string' ? raw.subA : '';
  const subB = typeof raw.subB === 'string' ? raw.subB : '';
  const status = raw.status === 'open' || raw.status === 'closed' ? raw.status : null;
  const openedAt = typeof raw.openedAt === 'number' && Number.isFinite(raw.openedAt) ? raw.openedAt : NaN;
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : NaN;
  if (!pairKey || !subA || !subB || !status || !Number.isFinite(openedAt) || !Number.isFinite(updatedAt)) {
    return null;
  }
  const closedAt =
    typeof raw.closedAt === 'number' && Number.isFinite(raw.closedAt) ? raw.closedAt : undefined;
  const reopenedAt =
    typeof raw.reopenedAt === 'number' && Number.isFinite(raw.reopenedAt) ? raw.reopenedAt : undefined;
  return { pairKey, subA, subB, status, openedAt, updatedAt, closedAt, reopenedAt };
}

export function parseDirectMessageItem(raw: Record<string, unknown> | undefined): DirectMessageItem | null {
  if (!raw) return null;
  const pairKey = typeof raw.pairKey === 'string' ? raw.pairKey : '';
  const sk = typeof raw.sk === 'string' ? raw.sk : '';
  const messageId = typeof raw.messageId === 'string' ? raw.messageId : '';
  const senderSub = typeof raw.senderSub === 'string' ? raw.senderSub : '';
  const kind = raw.kind === 'text' ? 'text' : null;
  const body = typeof raw.body === 'string' ? raw.body : '';
  const sentAt = typeof raw.sentAt === 'number' && Number.isFinite(raw.sentAt) ? raw.sentAt : NaN;
  if (!pairKey || !sk || !messageId || !senderSub || !kind || !body || !Number.isFinite(sentAt)) {
    return null;
  }
  return { pairKey, sk, messageId, senderSub, kind, body, sentAt };
}

export function toDirectMessageWire(item: DirectMessageItem): DirectMessageWire {
  return {
    messageId: item.messageId,
    senderSub: item.senderSub,
    kind: item.kind,
    body: item.body,
    sentAt: item.sentAt,
  };
}

export function dmReadRateLimitKey(fanSub: string, bucketMs: number): { pk: string; sk: string } {
  return { pk: `dm-read#${fanSub}`, sk: String(bucketMs) };
}

export async function enforceDmReadRateLimit(
  doc: DynamoDBDocumentClient,
  tableName: string,
  fanSub: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const bucketMs = minuteBucketEpochMs(nowMs);
  const { pk, sk } = dmReadRateLimitKey(fanSub, bucketMs);
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

export async function friendshipActiveForCaller(
  doc: DynamoDBDocumentClient,
  tableName: string,
  pairKey: string,
  fanSub: string,
): Promise<boolean> {
  const out = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: { pairKey, fanSub },
    }),
  );
  return Boolean(out.Item);
}

export async function getDmThread(
  doc: DynamoDBDocumentClient,
  tableName: string,
  pairKey: string,
): Promise<DmThreadItem | null> {
  const out = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: { pairKey },
    }),
  );
  return parseDmThreadItem(out.Item as Record<string, unknown> | undefined);
}

export function parseHistoryLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DM_HISTORY_DEFAULT_LIMIT;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    return DM_HISTORY_DEFAULT_LIMIT;
  }
  return Math.min(n, DM_HISTORY_MAX_LIMIT);
}
