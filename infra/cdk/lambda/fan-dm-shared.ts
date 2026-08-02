import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { TextEncoder } from 'node:util';
import {
  avatarUrlFromStoredProfile,
  displayNameFromStoredProfile,
} from './fan-profile-shared';
import { FAN_CONNECTIONS_FAN_SUB_INDEX } from './dm-shared';

const encoder = new TextEncoder();

export type DmMessageTextPushEnvelope = {
  type: 'dm_message';
  schemaVersion: 1;
  pairKey: string;
  messageId: string;
  senderSub: string;
  kind: 'text';
  body: string;
  sentAt: number;
  displayName?: string;
  avatarUrl?: string;
};

export type DmMessageGifPushEnvelope = {
  type: 'dm_message';
  schemaVersion: 1;
  pairKey: string;
  messageId: string;
  senderSub: string;
  kind: 'gif';
  body: string;
  giphyId: string;
  renditionUrl: string;
  title?: string;
  width?: number;
  height?: number;
  sentAt: number;
  displayName?: string;
  avatarUrl?: string;
};

export type DmMessagePushEnvelope = DmMessageTextPushEnvelope | DmMessageGifPushEnvelope;

export type DmUnreadPushEnvelope = {
  type: 'dm_unread';
  schemaVersion: 1;
  pairKey: string;
  hasUnread: boolean;
  lastReadSentAt: number;
  lastReadMessageId: string;
};

export function fanDmWsManagementClient(): ApiGatewayManagementApiClient {
  const endpoint = process.env.FAN_DM_WS_MANAGEMENT_API_ENDPOINT;
  if (!endpoint) {
    throw new Error('Missing FAN_DM_WS_MANAGEMENT_API_ENDPOINT');
  }
  return new ApiGatewayManagementApiClient({ endpoint });
}

export async function queryFanConnectionIdsForFanSub(
  doc: DynamoDBDocumentClient,
  tableName: string,
  fanSub: string,
): Promise<string[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: FAN_CONNECTIONS_FAN_SUB_INDEX,
      KeyConditionExpression: 'fanSub = :fanSub',
      ExpressionAttributeValues: { ':fanSub': fanSub },
    }),
  );
  const ids: string[] = [];
  for (const item of out.Items ?? []) {
    const connectionId = item.connectionId;
    if (typeof connectionId === 'string' && connectionId.length > 0) {
      ids.push(connectionId);
    }
  }
  return ids;
}

function isPostToConnectionGone(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'GoneException';
}

export async function postToFanConnections(
  client: ApiGatewayManagementApiClient,
  doc: DynamoDBDocumentClient,
  connectionsTable: string,
  connectionIds: readonly string[],
  payload: Uint8Array,
): Promise<void> {
  for (const connectionId of connectionIds) {
    try {
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: payload,
        }),
      );
    } catch (err: unknown) {
      if (isPostToConnectionGone(err)) {
        await doc
          .send(
            new DeleteCommand({
              TableName: connectionsTable,
              Key: { connectionId },
            }),
          )
          .catch(() => undefined);
      } else {
        console.warn(
          JSON.stringify({
            riffsyncDiag: 'fan_dm_post_to_connection_failed',
            connectionIdTail: connectionId.slice(-12),
            errorName: err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : 'unknown',
          }),
        );
      }
    }
  }
}

export function buildDmMessagePushEnvelope(input: {
  pairKey: string;
  messageId: string;
  senderSub: string;
  kind?: 'text' | 'gif';
  body: string;
  giphyId?: string;
  renditionUrl?: string;
  title?: string;
  width?: number;
  height?: number;
  sentAt: number;
  senderProfile?: Record<string, unknown>;
}): DmMessagePushEnvelope {
  const displayName = displayNameFromStoredProfile(input.senderProfile);
  const avatarUrl = avatarUrlFromStoredProfile(input.senderProfile);
  if (input.kind === 'gif') {
    return {
      type: 'dm_message',
      schemaVersion: 1,
      pairKey: input.pairKey,
      messageId: input.messageId,
      senderSub: input.senderSub,
      kind: 'gif',
      body: input.body,
      giphyId: input.giphyId ?? '',
      renditionUrl: input.renditionUrl ?? '',
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      sentAt: input.sentAt,
      ...(displayName ? { displayName } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
    };
  }
  return {
    type: 'dm_message',
    schemaVersion: 1,
    pairKey: input.pairKey,
    messageId: input.messageId,
    senderSub: input.senderSub,
    kind: 'text',
    body: input.body,
    sentAt: input.sentAt,
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export async function loadFanProfile(
  doc: DynamoDBDocumentClient,
  tableName: string,
  fanSub: string,
): Promise<Record<string, unknown> | undefined> {
  const out = await doc.send(
    new GetCommand({
      TableName: tableName,
      Key: { sub: fanSub },
    }),
  );
  return out.Item as Record<string, unknown> | undefined;
}

export async function pushDmMessageToRecipient(input: {
  doc: DynamoDBDocumentClient;
  fanConnectionsTable: string;
  fanProfilesTable: string;
  recipientFanSub: string;
  senderSub: string;
  pairKey: string;
  messageId: string;
  kind?: 'text' | 'gif';
  body: string;
  giphyId?: string;
  renditionUrl?: string;
  title?: string;
  width?: number;
  height?: number;
  sentAt: number;
}): Promise<void> {
  const connectionIds = await queryFanConnectionIdsForFanSub(
    input.doc,
    input.fanConnectionsTable,
    input.recipientFanSub,
  );
  if (connectionIds.length === 0) {
    return;
  }

  const senderProfile = await loadFanProfile(input.doc, input.fanProfilesTable, input.senderSub).catch(
    () => undefined,
  );
  const envelope = buildDmMessagePushEnvelope({
    pairKey: input.pairKey,
    messageId: input.messageId,
    senderSub: input.senderSub,
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    body: input.body,
    ...(input.giphyId !== undefined ? { giphyId: input.giphyId } : {}),
    ...(input.renditionUrl !== undefined ? { renditionUrl: input.renditionUrl } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    sentAt: input.sentAt,
    senderProfile,
  });
  const payload = encoder.encode(JSON.stringify(envelope));
  const client = fanDmWsManagementClient();
  await postToFanConnections(client, input.doc, input.fanConnectionsTable, connectionIds, payload);
}

export function buildDmUnreadPushEnvelope(input: {
  pairKey: string;
  hasUnread: boolean;
  lastReadSentAt: number;
  lastReadMessageId: string;
}): DmUnreadPushEnvelope {
  return {
    type: 'dm_unread',
    schemaVersion: 1,
    pairKey: input.pairKey,
    hasUnread: input.hasUnread,
    lastReadSentAt: input.lastReadSentAt,
    lastReadMessageId: input.lastReadMessageId,
  };
}

export async function pushDmUnreadToRecipient(input: {
  doc: DynamoDBDocumentClient;
  fanConnectionsTable: string;
  recipientFanSub: string;
  pairKey: string;
  hasUnread: boolean;
  lastReadSentAt: number;
  lastReadMessageId: string;
}): Promise<void> {
  const connectionIds = await queryFanConnectionIdsForFanSub(
    input.doc,
    input.fanConnectionsTable,
    input.recipientFanSub,
  );
  if (connectionIds.length === 0) {
    return;
  }

  const envelope = buildDmUnreadPushEnvelope({
    pairKey: input.pairKey,
    hasUnread: input.hasUnread,
    lastReadSentAt: input.lastReadSentAt,
    lastReadMessageId: input.lastReadMessageId,
  });
  const payload = encoder.encode(JSON.stringify(envelope));
  const client = fanDmWsManagementClient();
  await postToFanConnections(client, input.doc, input.fanConnectionsTable, connectionIds, payload);
}
