import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { batchAvatarUrlsByFanSub, batchDisplayNamesByFanSub } from './fan-profile-shared';
import {
  deny,
  enforceFriendshipRateLimit,
  FRIENDSHIPS_FAN_SUB_INDEX,
  jsonResponse,
  parseFriendshipMemberItem,
  requireFanSub,
  type FriendshipMemberItem,
} from './friends-shared';
import { isFanOnlineInAnyRoom } from './room-presence-shared';
import { parseDmUnreadItem } from './dm-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const FRIEND_LIST_LIMIT_PER_MINUTE = 60;

export type FriendListEntryWire = {
  fanSub: string;
  pairKey: string;
  displayName: string;
  avatarUrl?: string;
  online: boolean;
  hasUnread: boolean;
  createdAt: number;
};

function tables():
  | {
      ok: true;
      friendships: string;
      fanProfiles: string;
      roomPresence: string;
      rateLimits: string;
      dmUnread: string;
    }
  | { ok: false; response: APIGatewayProxyResultV2 } {
  const friendships = process.env.FRIENDSHIPS_TABLE_NAME?.trim();
  const fanProfiles = process.env.FAN_PROFILES_TABLE_NAME?.trim();
  const roomPresence = process.env.ROOM_PRESENCE_TABLE_NAME?.trim();
  const rateLimits = process.env.FRIENDSHIP_RATE_LIMIT_TABLE_NAME?.trim();
  const dmUnread = process.env.DM_UNREAD_TABLE_NAME?.trim();
  if (!friendships || !fanProfiles || !roomPresence || !rateLimits || !dmUnread) {
    return {
      ok: false,
      response: jsonResponse(500, { error: 'Server misconfigured' }),
    };
  }
  return { ok: true, friendships, fanProfiles, roomPresence, rateLimits, dmUnread };
}

function listLimit(): number {
  const raw = process.env.FRIEND_LIST_LIMIT_PER_MINUTE;
  const n = raw !== undefined ? Number.parseInt(raw, 10) : FRIEND_LIST_LIMIT_PER_MINUTE;
  return Number.isFinite(n) && n > 0 ? n : FRIEND_LIST_LIMIT_PER_MINUTE;
}

async function queryFriendshipsByFanSub(
  tableName: string,
  fanSub: string,
): Promise<FriendshipMemberItem[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: FRIENDSHIPS_FAN_SUB_INDEX,
      KeyConditionExpression: 'fanSub = :fanSub',
      ExpressionAttributeValues: { ':fanSub': fanSub },
    }),
  );
  const items: FriendshipMemberItem[] = [];
  for (const raw of out.Items ?? []) {
    const parsed = parseFriendshipMemberItem(raw as Record<string, unknown>);
    if (parsed) items.push(parsed);
  }
  return items;
}

export function sortFriendListEntries(entries: FriendListEntryWire[]): FriendListEntryWire[] {
  return [...entries].sort((a, b) => {
    const nameCmp = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.pairKey.localeCompare(b.pairKey);
  });
}

export async function buildFriendListEntries(
  callerFanSub: string,
  t: { friendships: string; fanProfiles: string; roomPresence: string; dmUnread: string },
): Promise<FriendListEntryWire[]> {
  const edges = await queryFriendshipsByFanSub(t.friendships, callerFanSub);
  if (edges.length === 0) {
    return [];
  }

  const peerSubs = edges.map((e) => e.peerSub);
  const [displayNames, avatarUrls, unreadByPairKey] = await Promise.all([
    batchDisplayNamesByFanSub(doc, t.fanProfiles, peerSubs),
    batchAvatarUrlsByFanSub(doc, t.fanProfiles, peerSubs),
    batchHasUnreadByPairKey(doc, t.dmUnread, callerFanSub, edges.map((e) => e.pairKey)),
  ]);

  const onlineByPeer = new Map<string, boolean>();
  await Promise.all(
    peerSubs.map(async (peerSub) => {
      const online = await isFanOnlineInAnyRoom(doc, t.roomPresence, peerSub);
      onlineByPeer.set(peerSub, online);
    }),
  );

  const entries: FriendListEntryWire[] = edges.map((edge) => {
    const displayName = displayNames.get(edge.peerSub) ?? 'Friend';
    const avatarUrl = avatarUrls.get(edge.peerSub);
    const entry: FriendListEntryWire = {
      fanSub: edge.peerSub,
      pairKey: edge.pairKey,
      displayName,
      online: onlineByPeer.get(edge.peerSub) ?? false,
      hasUnread: unreadByPairKey.get(edge.pairKey) ?? false,
      createdAt: edge.createdAt,
    };
    if (avatarUrl) {
      entry.avatarUrl = avatarUrl;
    }
    return entry;
  });

  return sortFriendListEntries(entries);
}

async function batchHasUnreadByPairKey(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  recipientSub: string,
  pairKeys: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (pairKeys.length === 0) {
    return result;
  }

  const chunkSize = 100;
  for (let i = 0; i < pairKeys.length; i += chunkSize) {
    const chunk = pairKeys.slice(i, i + chunkSize);
    const out = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: chunk.map((pairKey) => ({ recipientSub, pairKey })),
          },
        },
      }),
    );
    for (const raw of out.Responses?.[tableName] ?? []) {
      const parsed = parseDmUnreadItem(raw as Record<string, unknown>);
      if (parsed) {
        result.set(parsed.pairKey, parsed.hasUnread);
      }
    }
  }

  return result;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const t = tables();
  if (!t.ok) return t.response;

  const auth = requireFanSub(event);
  if (!auth.ok) return auth.response;

  const method = event.requestContext.http.method.toUpperCase();
  const path = event.rawPath.replace(/\/+$/, '') || '/';
  if (method !== 'GET' || path !== '/v1/friends') {
    return jsonResponse(404, { error: 'Not found' });
  }

  const allowed = await enforceFriendshipRateLimit(doc, t.rateLimits, 'list', auth.fanSub, listLimit());
  if (!allowed) {
    return deny(429, 'rate_limited', 'Friends list rate limit exceeded');
  }

  const friends = await buildFriendListEntries(auth.fanSub, t);
  const anyUnread = friends.some((friend) => friend.hasUnread);
  return jsonResponse(200, { friends, anyUnread });
};
