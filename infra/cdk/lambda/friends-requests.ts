import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  deny,
  emptyResponse,
  enforceFriendshipRateLimit,
  FRIEND_ACTION_LIMIT_PER_MINUTE,
  FRIEND_INVITE_LIMIT_PER_MINUTE,
  friendshipExists,
  friendshipMemberItems,
  friendshipPairKey,
  FRIENDSHIP_REQUESTS_RECIPIENT_INDEX,
  FRIENDSHIP_REQUESTS_REQUESTER_INDEX,
  jsonResponse,
  parseFriendshipRequestItem,
  queryPendingByPairKey,
  queryPendingByRole,
  requireFanSub,
  toPendingWire,
  type FriendshipRequestItem,
} from './friends-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tables():
  | { ok: true; requests: string; friendships: string; rateLimits: string }
  | { ok: false; response: APIGatewayProxyResultV2 } {
  const requests = process.env.FRIENDSHIP_REQUESTS_TABLE_NAME?.trim();
  const friendships = process.env.FRIENDSHIPS_TABLE_NAME?.trim();
  const rateLimits = process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME?.trim();
  if (!requests || !friendships || !rateLimits) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Server misconfigured' }),
    };
  }
  return { ok: true, requests, friendships, rateLimits };
}

function inviteLimit(): number {
  const raw = process.env.FRIEND_INVITE_LIMIT_PER_MINUTE;
  const n = raw !== undefined ? Number.parseInt(raw, 10) : FRIEND_INVITE_LIMIT_PER_MINUTE;
  return Number.isFinite(n) && n > 0 ? n : FRIEND_INVITE_LIMIT_PER_MINUTE;
}

function actionLimit(): number {
  const raw = process.env.FRIEND_ACTION_LIMIT_PER_MINUTE;
  const n = raw !== undefined ? Number.parseInt(raw, 10) : FRIEND_ACTION_LIMIT_PER_MINUTE;
  return Number.isFinite(n) && n > 0 ? n : FRIEND_ACTION_LIMIT_PER_MINUTE;
}

function parseRecipientSub(body: string | undefined): string | null {
  if (!body) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const recipientSub = (parsed as { recipientSub?: unknown }).recipientSub;
  if (typeof recipientSub !== 'string') return null;
  const trimmed = recipientSub.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function routeKind(
  method: string,
  rawPath: string,
): 'invite' | 'list' | 'accept' | 'decline' | 'cancel' | 'unknown' {
  const path = rawPath.replace(/\/+$/, '') || '/';
  if (method === 'POST' && path.endsWith('/v1/friends/requests')) return 'invite';
  if (method === 'GET' && path.endsWith('/v1/friends/requests')) return 'list';
  if (method === 'POST' && /\/v1\/friends\/requests\/[^/]+\/accept$/.test(path)) return 'accept';
  if (method === 'POST' && /\/v1\/friends\/requests\/[^/]+\/decline$/.test(path)) return 'decline';
  if (method === 'DELETE' && /\/v1\/friends\/requests\/[^/]+$/.test(path)) return 'cancel';
  return 'unknown';
}

async function handleInvite(
  fanSub: string,
  body: string | undefined,
  t: { requests: string; friendships: string; rateLimits: string },
): Promise<APIGatewayProxyResultV2> {
  const recipientSub = parseRecipientSub(body);
  if (!recipientSub) {
    return deny(400, 'invalid_request', 'recipientSub is required');
  }
  if (recipientSub === fanSub) {
    return deny(400, 'cannot_friend_self', 'Cannot send a friend request to yourself');
  }

  const allowed = await enforceFriendshipRateLimit(doc, t.rateLimits, 'invite', fanSub, inviteLimit());
  if (!allowed) {
    return deny(429, 'rate_limited', 'Friend request rate limit exceeded');
  }

  const pairKey = friendshipPairKey(fanSub, recipientSub);
  if (await friendshipExists(doc, t.friendships, pairKey)) {
    return deny(409, 'already_friends', 'Already friends');
  }

  const pending = await queryPendingByPairKey(doc, t.requests, pairKey);
  const sameDirection = pending.find((p) => p.requesterSub === fanSub && p.recipientSub === recipientSub);
  if (sameDirection) {
    return jsonResponse(200, toPendingWire(sameDirection));
  }
  const opposite = pending.find((p) => p.requesterSub === recipientSub && p.recipientSub === fanSub);
  if (opposite) {
    return deny(409, 'friend_request_inbound_exists', 'Accept or decline the inbound friend request');
  }

  const createdAt = Date.now();
  const item: FriendshipRequestItem = {
    requestId: randomUUID(),
    requesterSub: fanSub,
    recipientSub,
    status: 'pending',
    pairKey,
    createdAt,
  };

  try {
    await doc.send(
      new PutCommand({
        TableName: t.requests,
        Item: item,
        ConditionExpression: 'attribute_not_exists(requestId)',
      }),
    );
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'ConditionalCheckFailedException') {
      const again = await queryPendingByPairKey(doc, t.requests, pairKey);
      const existing = again.find((p) => p.requesterSub === fanSub && p.recipientSub === recipientSub);
      if (existing) return jsonResponse(200, toPendingWire(existing));
    }
    throw e;
  }

  return jsonResponse(201, toPendingWire(item));
}

async function handleList(
  fanSub: string,
  t: { requests: string },
): Promise<APIGatewayProxyResultV2> {
  const [inboundRaw, outboundRaw] = await Promise.all([
    queryPendingByRole(doc, t.requests, FRIENDSHIP_REQUESTS_RECIPIENT_INDEX, 'recipientSub', fanSub),
    queryPendingByRole(doc, t.requests, FRIENDSHIP_REQUESTS_REQUESTER_INDEX, 'requesterSub', fanSub),
  ]);

  return jsonResponse(200, {
    inbound: inboundRaw.map(toPendingWire),
    outbound: outboundRaw.map(toPendingWire),
  });
}

async function loadRequest(
  tableName: string,
  requestId: string,
): Promise<FriendshipRequestItem | null> {
  const out = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: { requestId },
    }),
  );
  return parseFriendshipRequestItem(out.Item as Record<string, unknown> | undefined);
}

async function handleAccept(
  fanSub: string,
  requestId: string,
  t: { requests: string; friendships: string; rateLimits: string },
): Promise<APIGatewayProxyResultV2> {
  const allowed = await enforceFriendshipRateLimit(doc, t.rateLimits, 'action', fanSub, actionLimit());
  if (!allowed) {
    return deny(429, 'rate_limited', 'Friend request rate limit exceeded');
  }

  const request = await loadRequest(t.requests, requestId);
  if (!request) {
    return deny(404, 'friend_request_not_found', 'Friend request not found');
  }
  if (request.recipientSub !== fanSub) {
    return deny(403, 'friend_request_not_recipient', 'Only the recipient may accept');
  }

  const createdAt = Date.now();
  const [memberA, memberB] = friendshipMemberItems(request.pairKey, createdAt);
  const pendings = await queryPendingByPairKey(doc, t.requests, request.pairKey);
  const toDelete = pendings.length > 0 ? pendings : [request];

  const transactItems = [
    ...toDelete.map((p) => ({
      Delete: {
        TableName: t.requests,
        Key: { requestId: p.requestId },
      },
    })),
    {
      Put: {
        TableName: t.friendships,
        Item: memberA,
        ConditionExpression: 'attribute_not_exists(pairKey) AND attribute_not_exists(fanSub)',
      },
    },
    {
      Put: {
        TableName: t.friendships,
        Item: memberB,
        ConditionExpression: 'attribute_not_exists(pairKey) AND attribute_not_exists(fanSub)',
      },
    },
  ];

  try {
    await doc.send(
      new TransactWriteCommand({
        TransactItems: transactItems,
      }),
    );
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
      if (await friendshipExists(doc, t.friendships, request.pairKey)) {
        return deny(409, 'already_friends', 'Already friends');
      }
      const still = await loadRequest(t.requests, requestId);
      if (!still) {
        return deny(404, 'friend_request_not_found', 'Friend request not found');
      }
    }
    throw e;
  }

  return jsonResponse(200, {
    pairKey: request.pairKey,
    fanSubA: memberA.fanSubA,
    fanSubB: memberA.fanSubB,
    createdAt,
  });
}

async function handleDecline(
  fanSub: string,
  requestId: string,
  t: { requests: string; rateLimits: string },
): Promise<APIGatewayProxyResultV2> {
  const allowed = await enforceFriendshipRateLimit(doc, t.rateLimits, 'action', fanSub, actionLimit());
  if (!allowed) {
    return deny(429, 'rate_limited', 'Friend request rate limit exceeded');
  }

  const request = await loadRequest(t.requests, requestId);
  if (!request) {
    return deny(404, 'friend_request_not_found', 'Friend request not found');
  }
  if (request.recipientSub !== fanSub) {
    return deny(403, 'friend_request_not_recipient', 'Only the recipient may decline');
  }

  try {
    await doc.send(
      new DeleteCommand({
        TableName: t.requests,
        Key: { requestId },
        ConditionExpression: 'recipientSub = :fanSub AND #status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':fanSub': fanSub, ':pending': 'pending' },
      }),
    );
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'ConditionalCheckFailedException') {
      return deny(404, 'friend_request_not_found', 'Friend request not found');
    }
    throw e;
  }

  return emptyResponse(204);
}

async function handleCancel(
  fanSub: string,
  requestId: string,
  t: { requests: string; rateLimits: string },
): Promise<APIGatewayProxyResultV2> {
  const allowed = await enforceFriendshipRateLimit(doc, t.rateLimits, 'action', fanSub, actionLimit());
  if (!allowed) {
    return deny(429, 'rate_limited', 'Friend request rate limit exceeded');
  }

  const request = await loadRequest(t.requests, requestId);
  if (!request) {
    return deny(404, 'friend_request_not_found', 'Friend request not found');
  }
  if (request.requesterSub !== fanSub) {
    return deny(403, 'friend_request_not_requester', 'Only the requester may cancel');
  }

  try {
    await doc.send(
      new DeleteCommand({
        TableName: t.requests,
        Key: { requestId },
        ConditionExpression: 'requesterSub = :fanSub AND #status = :pending',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':fanSub': fanSub, ':pending': 'pending' },
      }),
    );
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'ConditionalCheckFailedException') {
      return deny(404, 'friend_request_not_found', 'Friend request not found');
    }
    throw e;
  }

  return emptyResponse(204);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const t = tables();
  if (!t.ok) return t.response;

  const auth = requireFanSub(event);
  if (!auth.ok) return auth.response;

  const method = event.requestContext.http.method.toUpperCase();
  const kind = routeKind(method, event.rawPath);
  const requestId = event.pathParameters?.requestId?.trim() ?? '';

  switch (kind) {
    case 'invite':
      return handleInvite(auth.fanSub, event.body, t);
    case 'list':
      return handleList(auth.fanSub, t);
    case 'accept':
      if (!requestId) return deny(404, 'friend_request_not_found', 'Friend request not found');
      return handleAccept(auth.fanSub, requestId, t);
    case 'decline':
      if (!requestId) return deny(404, 'friend_request_not_found', 'Friend request not found');
      return handleDecline(auth.fanSub, requestId, t);
    case 'cancel':
      if (!requestId) return deny(404, 'friend_request_not_found', 'Friend request not found');
      return handleCancel(auth.fanSub, requestId, t);
    default:
      return deny(404, 'friend_request_not_found', 'Not found');
  }
};
