import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  assertDmThreadAccess,
  directMessageSortKey,
  dmDeny,
  enforceDmSendRateLimit,
  isPairMember,
  jsonResponse,
  parseDmSendBody,
  peerSubForCaller,
  requireFanSub,
  DM_SEND_LIMIT_PER_MINUTE,
} from './dm-shared';
import { pushDmMessageToRecipient } from './fan-dm-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function tables():
  | {
      ok: true;
      dmThreads: string;
      directMessages: string;
      friendships: string;
      rateLimits: string;
      fanConnections: string;
      fanProfiles: string;
      dmUnread: string;
    }
  | { ok: false; response: APIGatewayProxyResultV2 } {
  const dmThreads = process.env.DM_THREADS_TABLE_NAME?.trim();
  const directMessages = process.env.DIRECT_MESSAGES_TABLE_NAME?.trim();
  const friendships = process.env.FRIENDSHIPS_TABLE_NAME?.trim();
  const rateLimits = process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME?.trim();
  const fanConnections = process.env.FAN_CONNECTIONS_TABLE_NAME?.trim();
  const fanProfiles = process.env.FAN_PROFILES_TABLE_NAME?.trim();
  const dmUnread = process.env.DM_UNREAD_TABLE_NAME?.trim();
  if (!dmThreads || !directMessages || !friendships || !rateLimits || !fanConnections || !fanProfiles || !dmUnread) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Server misconfigured' }),
    };
  }
  return {
    ok: true,
    dmThreads,
    directMessages,
    friendships,
    rateLimits,
    fanConnections,
    fanProfiles,
    dmUnread,
  };
}

function sendLimit(): number {
  const raw = process.env.DM_SEND_LIMIT_PER_MINUTE;
  const n = raw !== undefined ? Number.parseInt(raw, 10) : DM_SEND_LIMIT_PER_MINUTE;
  return Number.isFinite(n) && n > 0 ? n : DM_SEND_LIMIT_PER_MINUTE;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const t = tables();
  if (!t.ok) return t.response;

  const auth = requireFanSub(event);
  if (!auth.ok) return auth.response;

  const method = event.requestContext.http.method.toUpperCase();
  const path = event.rawPath.replace(/\/+$/, '') || '/';
  if (method !== 'POST' || !/^\/v1\/dm\/threads\/[^/]+\/messages$/.test(path)) {
    return jsonResponse(404, { error: 'Not found' });
  }

  const pairKey = event.pathParameters?.pairKey?.trim() ?? '';
  if (!pairKey || !isPairMember(pairKey, auth.fanSub)) {
    return dmDeny(403, 'dm_not_member', 'Not a member of this DM pair');
  }

  const parsedBody = parseDmSendBody(event.body);
  if (!parsedBody.ok) {
    return dmDeny(400, parsedBody.code, 'Invalid DM message body');
  }

  const allowed = await enforceDmSendRateLimit(doc, t.rateLimits, auth.fanSub, sendLimit());
  if (!allowed) {
    return dmDeny(429, 'rate_limited', 'DM send rate limit exceeded');
  }

  const access = await assertDmThreadAccess(doc, {
    pairKey,
    fanSub: auth.fanSub,
    friendshipsTable: t.friendships,
    dmThreadsTable: t.dmThreads,
    mode: 'send',
  });
  if (!access.ok) {
    return dmDeny(access.statusCode, access.code, 'DM thread access denied');
  }

  const recipientFanSub = peerSubForCaller(pairKey, auth.fanSub);
  if (!recipientFanSub) {
    return dmDeny(403, 'dm_not_member', 'Not a member of this DM pair');
  }

  const sentAt = Date.now();
  const sk = directMessageSortKey(sentAt, parsedBody.messageId);

  const preWriteAccess = await assertDmThreadAccess(doc, {
    pairKey,
    fanSub: auth.fanSub,
    friendshipsTable: t.friendships,
    dmThreadsTable: t.dmThreads,
    mode: 'send',
  });
  if (!preWriteAccess.ok) {
    return dmDeny(preWriteAccess.statusCode, preWriteAccess.code, 'DM thread access denied');
  }

  await doc.send(
    new PutCommand({
      TableName: t.directMessages,
      Item: {
        pairKey,
        sk,
        messageId: parsedBody.messageId,
        senderSub: auth.fanSub,
        kind: parsedBody.kind,
        body: parsedBody.body,
        sentAt,
        ...(parsedBody.kind === 'gif'
          ? {
              giphyId: parsedBody.giphyId,
              renditionUrl: parsedBody.renditionUrl,
              ...(parsedBody.title !== undefined ? { title: parsedBody.title } : {}),
              ...(parsedBody.width !== undefined ? { width: parsedBody.width } : {}),
              ...(parsedBody.height !== undefined ? { height: parsedBody.height } : {}),
            }
          : {}),
      },
    }),
  );

  await doc.send(
    new UpdateCommand({
      TableName: t.dmUnread,
      Key: { recipientSub: recipientFanSub, pairKey },
      UpdateExpression:
        'SET hasUnread = :true, updatedAt = :now, lastReadSentAt = if_not_exists(lastReadSentAt, :zero), lastReadMessageId = if_not_exists(lastReadMessageId, :empty)',
      ExpressionAttributeValues: {
        ':true': true,
        ':now': sentAt,
        ':zero': 0,
        ':empty': '',
      },
    }),
  );

  await pushDmMessageToRecipient({
    doc,
    fanConnectionsTable: t.fanConnections,
    fanProfilesTable: t.fanProfiles,
    recipientFanSub,
    senderSub: auth.fanSub,
    pairKey,
    messageId: parsedBody.messageId,
    kind: parsedBody.kind,
    body: parsedBody.body,
    ...(parsedBody.kind === 'gif'
      ? {
          giphyId: parsedBody.giphyId,
          renditionUrl: parsedBody.renditionUrl,
          ...(parsedBody.title !== undefined ? { title: parsedBody.title } : {}),
          ...(parsedBody.width !== undefined ? { width: parsedBody.width } : {}),
          ...(parsedBody.height !== undefined ? { height: parsedBody.height } : {}),
        }
      : {}),
    sentAt,
  }).catch((err: unknown) => {
    console.warn(
      JSON.stringify({
        riffsyncDiag: 'fan_dm_push_after_send_failed',
        pairKeyHead: pairKey.slice(0, 12),
        errorName: err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : 'unknown',
      }),
    );
  });

  return jsonResponse(201, {
    pairKey,
    messageId: parsedBody.messageId,
    senderSub: auth.fanSub,
    kind: parsedBody.kind,
    body: parsedBody.body,
    ...(parsedBody.kind === 'gif'
      ? {
          giphyId: parsedBody.giphyId,
          renditionUrl: parsedBody.renditionUrl,
          ...(parsedBody.title !== undefined ? { title: parsedBody.title } : {}),
          ...(parsedBody.width !== undefined ? { width: parsedBody.width } : {}),
          ...(parsedBody.height !== undefined ? { height: parsedBody.height } : {}),
        }
      : {}),
    sentAt,
  });
};
