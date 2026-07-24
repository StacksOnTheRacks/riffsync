import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { pushDmUnreadToRecipient } from './fan-dm-shared';
import {
  dmDeny,
  dmUnreadCursorFromItem,
  enforceDmReadRateLimit,
  friendshipActiveForCaller,
  getDmThread,
  getDmUnread,
  getLatestDirectMessage,
  isDirectMessageUnread,
  isPairMember,
  isReadCursorNewer,
  jsonResponse,
  parseDmReadBody,
  requireFanSub,
  DM_READ_LIMIT_PER_MINUTE,
} from './dm-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tables():
  | {
      ok: true;
      dmThreads: string;
      directMessages: string;
      friendships: string;
      dmUnread: string;
      rateLimits: string;
      fanConnections: string;
    }
  | { ok: false; response: APIGatewayProxyResultV2 } {
  const dmThreads = process.env.DM_THREADS_TABLE_NAME?.trim();
  const directMessages = process.env.DIRECT_MESSAGES_TABLE_NAME?.trim();
  const friendships = process.env.FRIENDSHIPS_TABLE_NAME?.trim();
  const dmUnread = process.env.DM_UNREAD_TABLE_NAME?.trim();
  const rateLimits = process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME?.trim();
  const fanConnections = process.env.FAN_CONNECTIONS_TABLE_NAME?.trim();
  if (!dmThreads || !directMessages || !friendships || !dmUnread || !rateLimits || !fanConnections) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Server misconfigured' }),
    };
  }
  return { ok: true, dmThreads, directMessages, friendships, dmUnread, rateLimits, fanConnections };
}

function readLimit(): number {
  const raw = process.env.DM_READ_LIMIT_PER_MINUTE;
  const n = raw !== undefined ? Number.parseInt(raw, 10) : DM_READ_LIMIT_PER_MINUTE;
  return Number.isFinite(n) && n > 0 ? n : DM_READ_LIMIT_PER_MINUTE;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const t = tables();
  if (!t.ok) return t.response;

  const auth = requireFanSub(event);
  if (!auth.ok) return auth.response;

  const method = event.requestContext.http.method.toUpperCase();
  const path = event.rawPath.replace(/\/+$/, '') || '/';
  if (method !== 'POST' || !/^\/v1\/dm\/threads\/[^/]+\/read$/.test(path)) {
    return jsonResponse(404, { error: 'Not found' });
  }

  const pairKey = event.pathParameters?.pairKey?.trim() ?? '';
  if (!pairKey || !isPairMember(pairKey, auth.fanSub)) {
    return dmDeny(403, 'dm_not_member', 'Not a member of this DM pair');
  }

  const parsedBody = parseDmReadBody(event.body);
  if (!parsedBody.ok) {
    return dmDeny(400, parsedBody.code, 'Invalid read cursor');
  }

  const allowed = await enforceDmReadRateLimit(doc, t.rateLimits, auth.fanSub, readLimit());
  if (!allowed) {
    return dmDeny(429, 'rate_limited', 'DM read rate limit exceeded');
  }

  const friendshipActive = await friendshipActiveForCaller(doc, t.friendships, pairKey, auth.fanSub);
  if (!friendshipActive) {
    return dmDeny(403, 'friendship_not_active', 'Active friendship required');
  }

  const thread = await getDmThread(doc, t.dmThreads, pairKey);
  if (!thread) {
    return dmDeny(404, 'dm_thread_not_found', 'DM thread not found');
  }
  if (thread.status === 'closed') {
    return dmDeny(403, 'dm_thread_closed', 'DM thread is closed');
  }

  const existing = await getDmUnread(doc, t.dmUnread, auth.fanSub, pairKey);
  const currentCursor = dmUnreadCursorFromItem(existing);
  const proposedCursor = {
    lastReadSentAt: parsedBody.lastReadSentAt,
    lastReadMessageId: parsedBody.lastReadMessageId,
  };

  if (!isReadCursorNewer(proposedCursor, currentCursor)) {
    return jsonResponse(200, {
      pairKey,
      lastReadSentAt: currentCursor.lastReadSentAt,
      lastReadMessageId: currentCursor.lastReadMessageId,
      hasUnread: existing?.hasUnread ?? false,
    });
  }

  const tip = await getLatestDirectMessage(doc, t.directMessages, pairKey);
  const hasUnread = tip ? isDirectMessageUnread(tip, proposedCursor) : false;
  const now = Date.now();

  await doc.send(
    new UpdateCommand({
      TableName: t.dmUnread,
      Key: { recipientSub: auth.fanSub, pairKey },
      UpdateExpression:
        'SET lastReadSentAt = :lastReadSentAt, lastReadMessageId = :lastReadMessageId, hasUnread = :hasUnread, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':lastReadSentAt': proposedCursor.lastReadSentAt,
        ':lastReadMessageId': proposedCursor.lastReadMessageId,
        ':hasUnread': hasUnread,
        ':updatedAt': now,
      },
    }),
  );

  await pushDmUnreadToRecipient({
    doc,
    fanConnectionsTable: t.fanConnections,
    recipientFanSub: auth.fanSub,
    pairKey,
    hasUnread,
    lastReadSentAt: proposedCursor.lastReadSentAt,
    lastReadMessageId: proposedCursor.lastReadMessageId,
  }).catch((err: unknown) => {
    console.warn(
      JSON.stringify({
        riffsyncDiag: 'fan_dm_unread_push_after_read_failed',
        pairKeyHead: pairKey.slice(0, 12),
        errorName: err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : 'unknown',
      }),
    );
  });

  return jsonResponse(200, {
    pairKey,
    lastReadSentAt: proposedCursor.lastReadSentAt,
    lastReadMessageId: proposedCursor.lastReadMessageId,
    hasUnread,
  });
};
