import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  deny,
  enforceFriendshipRateLimit,
  FRIEND_ACTION_LIMIT_PER_MINUTE,
  jsonResponse,
  requireFanSub,
  splitPairKey,
} from './friends-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tables():
  | { ok: true; friendships: string; rateLimits: string; dmThreads?: string }
  | { ok: false; response: APIGatewayProxyResultV2 } {
  const friendships = process.env.FRIENDSHIPS_TABLE_NAME?.trim();
  const rateLimits = process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME?.trim();
  if (!friendships || !rateLimits) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Server misconfigured' }),
    };
  }
  const dmThreadsRaw = process.env.DM_THREADS_TABLE_NAME?.trim();
  return {
    ok: true,
    friendships,
    rateLimits,
    dmThreads: dmThreadsRaw || undefined,
  };
}

function actionLimit(): number {
  const raw = process.env.FRIEND_ACTION_LIMIT_PER_MINUTE;
  const n = raw !== undefined ? Number.parseInt(raw, 10) : FRIEND_ACTION_LIMIT_PER_MINUTE;
  return Number.isFinite(n) && n > 0 ? n : FRIEND_ACTION_LIMIT_PER_MINUTE;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const t = tables();
  if (!t.ok) return t.response;

  const auth = requireFanSub(event);
  if (!auth.ok) return auth.response;

  const method = event.requestContext.http.method.toUpperCase();
  const path = event.rawPath.replace(/\/+$/, '') || '/';
  if (method !== 'DELETE' || !/^\/v1\/friends\/[^/]+$/.test(path) || path === '/v1/friends/requests') {
    return jsonResponse(404, { error: 'Not found' });
  }

  const pairKey = event.pathParameters?.pairKey?.trim() ?? '';
  if (!pairKey) {
    return deny(404, 'friendship_not_found', 'Friendship not found');
  }

  const parts = splitPairKey(pairKey);
  if (!parts || (auth.fanSub !== parts.fanSubA && auth.fanSub !== parts.fanSubB)) {
    return deny(403, 'friendship_not_member', 'Not a member of this friendship pair');
  }

  const allowed = await enforceFriendshipRateLimit(doc, t.rateLimits, 'action', auth.fanSub, actionLimit());
  if (!allowed) {
    return deny(429, 'rate_limited', 'Friend request rate limit exceeded');
  }

  const edge = await doc.send(
    new GetCommand({
      TableName: t.friendships,
      Key: { pairKey, fanSub: auth.fanSub },
    }),
  );
  if (!edge.Item) {
    return deny(404, 'friendship_not_found', 'Friendship not found');
  }

  const removedAt = Date.now();
  const { fanSubA, fanSubB } = parts;

  const transactItems: NonNullable<Parameters<typeof TransactWriteCommand>[0]>['TransactItems'] = [
    {
      Delete: {
        TableName: t.friendships,
        Key: { pairKey, fanSub: fanSubA },
        ConditionExpression: 'attribute_exists(pairKey)',
      },
    },
    {
      Delete: {
        TableName: t.friendships,
        Key: { pairKey, fanSub: fanSubB },
        ConditionExpression: 'attribute_exists(pairKey)',
      },
    },
  ];

  if (t.dmThreads) {
    const thread = await doc.send(
      new GetCommand({
        TableName: t.dmThreads,
        Key: { pairKey },
      }),
    );
    if (thread.Item) {
      transactItems.push({
        Update: {
          TableName: t.dmThreads,
          Key: { pairKey },
          UpdateExpression: 'SET #status = :closed, closedAt = :closedAt',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':closed': 'closed', ':closedAt': removedAt },
          ConditionExpression: 'attribute_exists(pairKey)',
        },
      });
    }
  }

  try {
    await doc.send(
      new TransactWriteCommand({
        TransactItems: transactItems,
      }),
    );
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
    if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
      const again = await doc.send(
        new GetCommand({
          TableName: t.friendships,
          Key: { pairKey, fanSub: auth.fanSub },
        }),
      );
      if (!again.Item) {
        return deny(404, 'friendship_not_found', 'Friendship not found');
      }
    }
    throw e;
  }

  return jsonResponse(200, { pairKey, removedAt });
};
