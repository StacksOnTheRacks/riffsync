import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { TextEncoder } from 'node:util';
import {
  postToConnections,
  queryConnectionsForRoom,
  wsManagementClient,
} from './ws-shared';

const encoder = new TextEncoder();

export const JOIN_RECONNECT_COOLDOWN_SEC = 30;

export function joinCooldownPresenceKey(fanSub: string): string {
  return `__joinCooldown__#${fanSub}`;
}

export async function recordFanDisconnectJoinCooldown(
  doc: DynamoDBDocumentClient,
  presenceTable: string,
  roomId: string,
  fanSub: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  await doc
    .send(
      new PutCommand({
        TableName: presenceTable,
        Item: {
          roomId,
          presenceKey: joinCooldownPresenceKey(fanSub),
          disconnectedAt: nowSec,
          expiresAt: nowSec + JOIN_RECONNECT_COOLDOWN_SEC + 60,
        },
      }),
    )
    .catch(() => undefined);
}

export async function isWithinJoinReconnectCooldown(
  doc: DynamoDBDocumentClient,
  presenceTable: string,
  roomId: string,
  fanSub: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const out = await doc.send(
    new GetCommand({
      TableName: presenceTable,
      Key: { roomId, presenceKey: joinCooldownPresenceKey(fanSub) },
    }),
  );
  const disconnectedAt = out.Item?.disconnectedAt;
  if (typeof disconnectedAt !== 'number') {
    return false;
  }
  return nowSec - disconnectedAt < JOIN_RECONNECT_COOLDOWN_SEC;
}

export async function fanOutChatSystem(params: {
  doc: DynamoDBDocumentClient;
  connectionsTable: string;
  presenceTable: string;
  roomId: string;
  sessionId: string;
  displayName: string;
  event: 'join' | 'leave';
  except?: string;
}): Promise<void> {
  const { doc, connectionsTable, presenceTable, roomId, sessionId, displayName, event, except } = params;
  const mgmt = wsManagementClient();
  const ids = await queryConnectionsForRoom(doc, presenceTable, roomId);
  const out: Record<string, unknown> = {
    type: 'chat_system',
    roomId,
    sessionId,
    displayName,
    event,
    ts: Date.now(),
  };
  const buf = encoder.encode(JSON.stringify(out));
  await postToConnections(mgmt, doc, connectionsTable, ids, buf, except, presenceTable);
}
