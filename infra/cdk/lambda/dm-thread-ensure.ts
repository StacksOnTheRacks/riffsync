import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  dmDeny,
  enforceDmReadRateLimit,
  friendshipActiveForCaller,
  friendshipPairKey,
  getDmThread,
  jsonResponse,
  requireFanSub,
  splitPairKey,
  DM_READ_LIMIT_PER_MINUTE,
} from './dm-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tables():
  | { ok: true; dmThreads: string; friendships: string; rateLimits: string }
  | { ok: false; response: APIGatewayProxyResultV2 } {
  const dmThreads = process.env.DM_THREADS_TABLE_NAME?.trim();
  const friendships = process.env.FRIENDSHIPS_TABLE_NAME?.trim();
  const rateLimits = process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME?.trim();
  if (!dmThreads || !friendships || !rateLimits) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Server misconfigured' }),
    };
  }
  return { ok: true, dmThreads, friendships, rateLimits };
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
  if (method !== 'PUT' || !/^\/v1\/dm\/threads\/[^/]+$/.test(path)) {
    return jsonResponse(404, { error: 'Not found' });
  }

  const peerSub = event.pathParameters?.peerSub?.trim() ?? '';
  if (!peerSub) {
    return jsonResponse(404, { error: 'Not found' });
  }

  if (peerSub === auth.fanSub) {
    return dmDeny(400, 'cannot_dm_self', 'Cannot open a DM thread with yourself');
  }

  const allowed = await enforceDmReadRateLimit(doc, t.rateLimits, auth.fanSub, readLimit());
  if (!allowed) {
    return dmDeny(429, 'rate_limited', 'DM read rate limit exceeded');
  }

  const pairKey = friendshipPairKey(auth.fanSub, peerSub);
  const parts = splitPairKey(pairKey);
  if (!parts) {
    return dmDeny(403, 'dm_not_member', 'Not a member of this DM pair');
  }

  const friendshipActive = await friendshipActiveForCaller(doc, t.friendships, pairKey, auth.fanSub);
  if (!friendshipActive) {
    return dmDeny(403, 'friendship_not_active', 'Active friendship required');
  }

  const existing = await getDmThread(doc, t.dmThreads, pairKey);
  if (existing) {
    if (existing.status === 'closed') {
      return dmDeny(403, 'dm_thread_closed', 'DM thread is closed');
    }
    return jsonResponse(200, {
      pairKey,
      peerSub,
      status: existing.status,
      openedAt: existing.openedAt,
    });
  }

  const now = Date.now();
  try {
    await doc.send(
      new PutCommand({
        TableName: t.dmThreads,
        Item: {
          pairKey,
          subA: parts.fanSubA,
          subB: parts.fanSubB,
          status: 'open',
          openedAt: now,
          updatedAt: now,
        },
        ConditionExpression: 'attribute_not_exists(pairKey)',
      }),
    );
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name !== 'ConditionalCheckFailedException') {
      throw e;
    }
    const raced = await getDmThread(doc, t.dmThreads, pairKey);
    if (!raced) {
      throw e;
    }
    if (raced.status === 'closed') {
      return dmDeny(403, 'dm_thread_closed', 'DM thread is closed');
    }
    return jsonResponse(200, {
      pairKey,
      peerSub,
      status: raced.status,
      openedAt: raced.openedAt,
    });
  }

  return jsonResponse(200, {
    pairKey,
    peerSub,
    status: 'open',
    openedAt: now,
  });
};
