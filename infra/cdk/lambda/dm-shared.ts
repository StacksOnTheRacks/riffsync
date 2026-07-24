import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  friendshipPairKey,
  jsonResponse,
  minuteBucketEpochMs,
  requireFanSub,
  splitPairKey,
} from './friends-shared';

export const DM_READ_LIMIT_PER_MINUTE = 60;
export const DM_SEND_LIMIT_PER_MINUTE = 20;
export const DM_HISTORY_DEFAULT_LIMIT = 50;
export const DM_HISTORY_MAX_LIMIT = 100;
export const DM_BODY_MAX_LEN = 2000;
export const FAN_CONNECTIONS_FAN_SUB_INDEX = 'FanSubIndex';

export type DmDenyCode =
  | 'cannot_dm_self'
  | 'fan_auth_required'
  | 'friendship_not_active'
  | 'dm_not_member'
  | 'dm_thread_closed'
  | 'dm_thread_not_found'
  | 'invalid_dm_body'
  | 'invalid_read_cursor'
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

export type DmReadCursor = {
  lastReadSentAt: number;
  lastReadMessageId: string;
};

export type DmUnreadItem = {
  recipientSub: string;
  pairKey: string;
  lastReadSentAt: number;
  lastReadMessageId: string;
  hasUnread: boolean;
  updatedAt: number;
};

export const DM_UNREAD_DEFAULT_CURSOR: DmReadCursor = {
  lastReadSentAt: 0,
  lastReadMessageId: '',
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

export function peerSubForCaller(pairKey: string, fanSub: string): string | null {
  const parts = splitPairKey(pairKey);
  if (!parts) return null;
  if (fanSub === parts.fanSubA) return parts.fanSubB;
  if (fanSub === parts.fanSubB) return parts.fanSubA;
  return null;
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

export function dmSendRateLimitKey(fanSub: string, bucketMs: number): { pk: string; sk: string } {
  return { pk: `dm-send#${fanSub}`, sk: String(bucketMs) };
}

async function enforceDmRateLimit(
  doc: DynamoDBDocumentClient,
  tableName: string,
  key: { pk: string; sk: string },
  limit: number,
  nowMs: number,
): Promise<boolean> {
  const expiresAt = Math.floor(nowMs / 1000) + 120;

  try {
    await doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
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

export async function enforceDmReadRateLimit(
  doc: DynamoDBDocumentClient,
  tableName: string,
  fanSub: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const bucketMs = minuteBucketEpochMs(nowMs);
  return enforceDmRateLimit(doc, tableName, dmReadRateLimitKey(fanSub, bucketMs), limit, nowMs);
}

export async function enforceDmSendRateLimit(
  doc: DynamoDBDocumentClient,
  tableName: string,
  fanSub: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const bucketMs = minuteBucketEpochMs(nowMs);
  return enforceDmRateLimit(doc, tableName, dmSendRateLimitKey(fanSub, bucketMs), limit, nowMs);
}

export function parseDmSendBody(raw: string | undefined):
  | { ok: true; messageId: string; kind: 'text'; body: string }
  | { ok: false; code: 'invalid_dm_body' } {
  if (!raw || raw.trim() === '') {
    return { ok: false, code: 'invalid_dm_body' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'invalid_dm_body' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, code: 'invalid_dm_body' };
  }
  const record = parsed as Record<string, unknown>;
  const messageId = typeof record.messageId === 'string' ? record.messageId.trim() : '';
  const kind = record.kind === 'text' ? 'text' : null;
  const body = typeof record.body === 'string' ? record.body.trim() : '';
  if (!messageId || !kind || !body || body.length > DM_BODY_MAX_LEN) {
    return { ok: false, code: 'invalid_dm_body' };
  }
  return { ok: true, messageId, kind, body };
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

export type DmAccessMode = 'ensure' | 'history' | 'send' | 'read';

export type AssertDmThreadAccessOk = {
  ok: true;
  thread: DmThreadItem | null;
  friendshipActive: boolean;
};

export type AssertDmThreadAccessDeny = {
  ok: false;
  statusCode: number;
  code: DmDenyCode;
};

export type AssertDmThreadAccessResult = AssertDmThreadAccessOk | AssertDmThreadAccessDeny;

export async function assertDmThreadAccess(
  doc: DynamoDBDocumentClient,
  params: {
    pairKey: string;
    fanSub: string;
    friendshipsTable: string;
    dmThreadsTable: string;
    mode: DmAccessMode;
  },
): Promise<AssertDmThreadAccessResult> {
  const { pairKey, fanSub, friendshipsTable, dmThreadsTable, mode } = params;

  if (!isPairMember(pairKey, fanSub)) {
    return { ok: false, statusCode: 403, code: 'dm_not_member' };
  }

  const friendshipActive = await friendshipActiveForCaller(doc, friendshipsTable, pairKey, fanSub);
  if (!friendshipActive) {
    return { ok: false, statusCode: 403, code: 'friendship_not_active' };
  }

  const thread = await getDmThread(doc, dmThreadsTable, pairKey);

  if (mode === 'ensure') {
    return { ok: true, thread, friendshipActive };
  }

  if (!thread) {
    return { ok: false, statusCode: 404, code: 'dm_thread_not_found' };
  }
  if (thread.status === 'closed') {
    return { ok: false, statusCode: 403, code: 'dm_thread_closed' };
  }

  return { ok: true, thread, friendshipActive };
}

export function directMessagePassesHistoryCutoff(
  message: DirectMessageItem,
  thread: DmThreadItem,
): boolean {
  if (thread.closedAt === undefined) {
    return true;
  }
  return message.sentAt > thread.closedAt;
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

export function compareReadCursors(a: DmReadCursor, b: DmReadCursor): number {
  if (a.lastReadSentAt !== b.lastReadSentAt) {
    return a.lastReadSentAt < b.lastReadSentAt ? -1 : 1;
  }
  if (a.lastReadMessageId === b.lastReadMessageId) {
    return 0;
  }
  return a.lastReadMessageId < b.lastReadMessageId ? -1 : 1;
}

export function isReadCursorNewer(proposed: DmReadCursor, current: DmReadCursor): boolean {
  return compareReadCursors(proposed, current) > 0;
}

export function isDirectMessageUnread(message: DirectMessageItem, cursor: DmReadCursor): boolean {
  if (message.sentAt > cursor.lastReadSentAt) {
    return true;
  }
  if (message.sentAt < cursor.lastReadSentAt) {
    return false;
  }
  return message.messageId > cursor.lastReadMessageId;
}

export function parseDmUnreadItem(raw: Record<string, unknown> | undefined): DmUnreadItem | null {
  if (!raw) return null;
  const recipientSub = typeof raw.recipientSub === 'string' ? raw.recipientSub : '';
  const pairKey = typeof raw.pairKey === 'string' ? raw.pairKey : '';
  const lastReadSentAt =
    typeof raw.lastReadSentAt === 'number' && Number.isFinite(raw.lastReadSentAt) ? raw.lastReadSentAt : NaN;
  const lastReadMessageId = typeof raw.lastReadMessageId === 'string' ? raw.lastReadMessageId : '';
  const hasUnread = raw.hasUnread === true;
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : NaN;
  if (!recipientSub || !pairKey || !Number.isFinite(lastReadSentAt) || !Number.isFinite(updatedAt)) {
    return null;
  }
  return {
    recipientSub,
    pairKey,
    lastReadSentAt,
    lastReadMessageId,
    hasUnread,
    updatedAt,
  };
}

export function dmUnreadCursorFromItem(item: DmUnreadItem | null | undefined): DmReadCursor {
  if (!item) {
    return { ...DM_UNREAD_DEFAULT_CURSOR };
  }
  return {
    lastReadSentAt: item.lastReadSentAt,
    lastReadMessageId: item.lastReadMessageId,
  };
}

export function parseDmReadBody(raw: string | undefined):
  | { ok: true; lastReadSentAt: number; lastReadMessageId: string }
  | { ok: false; code: 'invalid_read_cursor' } {
  if (!raw || raw.trim() === '') {
    return { ok: false, code: 'invalid_read_cursor' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'invalid_read_cursor' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, code: 'invalid_read_cursor' };
  }
  const record = parsed as Record<string, unknown>;
  const lastReadSentAt =
    typeof record.lastReadSentAt === 'number' && Number.isFinite(record.lastReadSentAt)
      ? record.lastReadSentAt
      : NaN;
  const lastReadMessageId =
    typeof record.lastReadMessageId === 'string' ? record.lastReadMessageId.trim() : '';
  if (!Number.isFinite(lastReadSentAt) || !lastReadMessageId) {
    return { ok: false, code: 'invalid_read_cursor' };
  }
  return { ok: true, lastReadSentAt, lastReadMessageId };
}

export async function getLatestDirectMessage(
  doc: DynamoDBDocumentClient,
  tableName: string,
  pairKey: string,
): Promise<DirectMessageItem | null> {
  const out = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pairKey = :pairKey',
      ExpressionAttributeValues: { ':pairKey': pairKey },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );
  const raw = out.Items?.[0] as Record<string, unknown> | undefined;
  return parseDirectMessageItem(raw);
}

export async function getDmUnread(
  doc: DynamoDBDocumentClient,
  tableName: string,
  recipientSub: string,
  pairKey: string,
): Promise<DmUnreadItem | null> {
  const out = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: { recipientSub, pairKey },
    }),
  );
  return parseDmUnreadItem(out.Item as Record<string, unknown> | undefined);
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
