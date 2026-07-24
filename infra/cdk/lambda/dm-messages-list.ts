import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  assertDmThreadAccess,
  decodeHistoryCursor,
  directMessagePassesHistoryCutoff,
  directMessageSortKey,
  dmDeny,
  encodeHistoryCursor,
  enforceDmReadRateLimit,
  isPairMember,
  jsonResponse,
  parseDirectMessageItem,
  parseHistoryLimit,
  requireFanSub,
  toDirectMessageWire,
  DM_READ_LIMIT_PER_MINUTE,
} from './dm-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tables():
  | { ok: true; dmThreads: string; directMessages: string; friendships: string; rateLimits: string }
  | { ok: false; response: APIGatewayProxyResultV2 } {
  const dmThreads = process.env.DM_THREADS_TABLE_NAME?.trim();
  const directMessages = process.env.DIRECT_MESSAGES_TABLE_NAME?.trim();
  const friendships = process.env.FRIENDSHIPS_TABLE_NAME?.trim();
  const rateLimits = process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME?.trim();
  if (!dmThreads || !directMessages || !friendships || !rateLimits) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Server misconfigured' }),
    };
  }
  return { ok: true, dmThreads, directMessages, friendships, rateLimits };
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
  if (method !== 'GET' || !/^\/v1\/dm\/threads\/[^/]+\/messages$/.test(path)) {
    return jsonResponse(404, { error: 'Not found' });
  }

  const pairKey = event.pathParameters?.pairKey?.trim() ?? '';
  if (!pairKey || !isPairMember(pairKey, auth.fanSub)) {
    return dmDeny(403, 'dm_not_member', 'Not a member of this DM pair');
  }

  const allowed = await enforceDmReadRateLimit(doc, t.rateLimits, auth.fanSub, readLimit());
  if (!allowed) {
    return dmDeny(429, 'rate_limited', 'DM read rate limit exceeded');
  }

  const access = await assertDmThreadAccess(doc, {
    pairKey,
    fanSub: auth.fanSub,
    friendshipsTable: t.friendships,
    dmThreadsTable: t.dmThreads,
    mode: 'history',
  });
  if (!access.ok) {
    return dmDeny(access.statusCode, access.code, 'DM thread access denied');
  }
  const thread = access.thread!;

  const limit = parseHistoryLimit(event.queryStringParameters?.limit);
  const beforeRaw = event.queryStringParameters?.before?.trim();
  let exclusiveStartKey: { pairKey: string; sk: string } | undefined;
  if (beforeRaw) {
    const cursor = decodeHistoryCursor(beforeRaw);
    if (!cursor) {
      return jsonResponse(400, { error: 'Invalid before cursor', code: 'invalid_request' });
    }
    exclusiveStartKey = {
      pairKey,
      sk: directMessageSortKey(cursor.sentAt, cursor.messageId),
    };
  }

  const out = await doc.send(
    new QueryCommand({
      TableName: t.directMessages,
      KeyConditionExpression: 'pairKey = :pairKey',
      ExpressionAttributeValues: { ':pairKey': pairKey },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  const messages = [];
  for (const raw of out.Items ?? []) {
    const parsed = parseDirectMessageItem(raw as Record<string, unknown>);
    if (parsed && directMessagePassesHistoryCutoff(parsed, thread)) {
      messages.push(toDirectMessageWire(parsed));
    }
  }

  const lastIncluded = messages[messages.length - 1];
  const nextCursor =
    out.LastEvaluatedKey && lastIncluded
      ? encodeHistoryCursor({ sentAt: lastIncluded.sentAt, messageId: lastIncluded.messageId })
      : null;

  return jsonResponse(200, { messages, nextCursor });
};
