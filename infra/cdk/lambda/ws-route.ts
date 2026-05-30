import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { TextEncoder } from 'node:util';
import { isHttpsGiphyCdnUrl } from './giphy-search-shared';
import { lobbySortKey, LOBBY_PARTITION } from './room-shared';
import { recordWsRealtimeRoute } from './riffsync-observability';
import {
  broadcastRoomPresence,
  broadcastRoomPresenceNow,
  postToConnections,
  presenceDisplayNameForSession,
  queryConnectionsForRoom,
  resolveChatOutboundAvatarUrl,
  wsManagementClient,
} from './ws-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const encoder = new TextEncoder();
const UUID_MESSAGE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidMessageId(value: string): boolean {
  return UUID_MESSAGE_ID_RE.test(value);
}

const CHAT_GIF_TITLE_MAX = 200;
const CHAT_GIF_DIMENSION_MAX = 4096;

function parseOptionalChatGifDimension(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > CHAT_GIF_DIMENSION_MAX) {
    return undefined;
  }
  return value;
}

function fanSubFromConn(conn: Record<string, unknown>): string {
  return typeof conn.fanSub === 'string' ? conn.fanSub.trim() : '';
}

function requireFanSub(
  conn: Record<string, unknown>,
  routeLabel: string,
): APIGatewayProxyResultV2 | null {
  if (fanSubFromConn(conn) === '') {
    return { statusCode: 403, body: `Fan JWT required for ${routeLabel}` };
  }
  return null;
}

function summarizeCaughtErr(err: unknown): { errorType: string; errorMessage: string } {
  if (typeof err !== 'object' || err === null) {
    return { errorType: typeof err, errorMessage: String(err) };
  }
  const o = err as { name?: unknown; message?: unknown };
  const name =
    typeof o.name === 'string' ? o.name : (typeof err.constructor === 'function' && err.constructor?.name) || 'Error';
  const message = typeof o.message === 'string' ? o.message : '(no message)';
  return { errorType: name, errorMessage: message };
}

async function websocketRouteInner(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> {
  let routeKey = event.requestContext.routeKey;
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  const presenceTable = process.env.ROOM_PRESENCE_TABLE_NAME;
  if (!roomsTable || !connTable || !presenceTable) {
    return { statusCode: 500, body: 'Missing table env' };
  }

  const connectionId = event.requestContext.connectionId;

  const connOut = await doc.send(
    new GetCommand({
      TableName: connTable,
      Key: { connectionId },
    }),
  );
  const conn = connOut.Item as Record<string, unknown> | undefined;
  if (!conn || typeof conn.roomId !== 'string') {
    return { statusCode: 410, body: 'Unknown connection' };
  }
  const roomId = conn.roomId;
  const sessionId = typeof conn.sessionId === 'string' ? conn.sessionId : '';
  const presenceKey = typeof conn.presenceKey === 'string' ? conn.presenceKey : `${sessionId}#${connectionId}`;

  const roomOut = await doc.send(
    new GetCommand({
      TableName: roomsTable,
      Key: { roomId },
    }),
  );
  const room = roomOut.Item as Record<string, unknown> | undefined;
  if (!room || typeof room.hostSub !== 'string') {
    return { statusCode: 410, body: 'Room missing' };
  }

  let body: Record<string, unknown> = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body) as Record<string, unknown>;
    } catch {
      return { statusCode: 400, body: 'Invalid JSON' };
    }
  }
  if (routeKey === '$default') {
    const a = body.action;
    if (typeof a === 'string') {
      routeKey = a;
    }
  }

  if (routeKey === 'ping') {
    const now = Math.max(
      Date.now(),
      typeof room.lastActivityAt === 'number' ? room.lastActivityAt : 0,
    );
    const names: Record<string, string> = {
      '#vat': 'lastActivityAt',
      '#lsk': 'lobbySk',
    };
    const values: Record<string, unknown> = { ':vat': now };
    let update = 'SET #vat = :vat';
    if (room.visibility === 'public' && room.lobbyPk === LOBBY_PARTITION) {
      values[':lsk'] = lobbySortKey(now, roomId);
      update += ', #lsk = :lsk';
    }
    await doc.send(
      new UpdateCommand({
        TableName: roomsTable,
        Key: { roomId },
        UpdateExpression: update,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );

    const nowSec = Math.floor(Date.now() / 1000);
    const pingTtlSec = 90 * 60;
    await doc
      .send(
        new UpdateCommand({
          TableName: connTable,
          Key: { connectionId },
          UpdateExpression: 'SET lastSeenAt = :ls, expiresAt = :ex',
          ExpressionAttributeValues: {
            ':ls': nowSec,
            ':ex': nowSec + pingTtlSec,
          },
        }),
      )
      .catch(() => undefined);
    await doc
      .send(
        new UpdateCommand({
          TableName: presenceTable,
          Key: { roomId, presenceKey },
          UpdateExpression: 'SET lastSeenAt = :ls, expiresAt = :ex',
          ExpressionAttributeValues: {
            ':ls': nowSec,
            ':ex': nowSec + pingTtlSec,
          },
        }),
      )
      .catch(() => undefined);

    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'presence_request') {
    await broadcastRoomPresence({ doc, connectionsTable: connTable, roomPresenceTable: presenceTable, roomId }).catch(
      () => undefined,
    );
    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'leave') {
    await doc.send(
      new DeleteCommand({
        TableName: connTable,
        Key: { connectionId },
      }),
    );
    await doc
      .send(
        new DeleteCommand({
          TableName: presenceTable,
          Key: { roomId, presenceKey },
        }),
      )
      .catch(() => undefined);
    await broadcastRoomPresenceNow({ doc, connectionsTable: connTable, roomPresenceTable: presenceTable, roomId }).catch(
      () => undefined,
    );
    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'share_state') {
    const hostSubConn = typeof conn.hostSub === 'string' ? conn.hostSub : undefined;
    const isPublisherConn = Boolean(hostSubConn && hostSubConn === room.hostSub);
    if (!isPublisherConn) {
      return { statusCode: 403, body: 'Publisher JWT required for share_state' };
    }
    const state = body.state;
    if (state !== 'started' && state !== 'stopped') {
      return { statusCode: 400, body: 'share_state requires state started|stopped' };
    }
    const shareGenRaw = body.shareGeneration;
    const shareGeneration =
      typeof shareGenRaw === 'number' && Number.isFinite(shareGenRaw) && shareGenRaw >= 0
        ? Math.floor(shareGenRaw)
        : undefined;
    const mgmt = wsManagementClient();
    const ids = await queryConnectionsForRoom(doc, presenceTable, roomId);
    const out: Record<string, unknown> = {
      type: 'share_state',
      roomId,
      sessionId,
      state,
    };
    if (shareGeneration !== undefined) {
      out.shareGeneration = shareGeneration;
    }
    const buf = encoder.encode(JSON.stringify(out));
    await postToConnections(mgmt, doc, connTable, ids, buf, undefined, presenceTable);
    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'chat') {
    const fanSubDenied = requireFanSub(conn, 'chat');
    if (fanSubDenied) {
      recordWsRealtimeRoute('chat', 403, connectionId, roomId);
      return fanSubDenied;
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text === '' || text.length > 2000) {
      recordWsRealtimeRoute('chat', 400, connectionId, roomId);
      return { statusCode: 400, body: 'text required, max 2000 chars' };
    }
    const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
    if (!isUuidMessageId(messageId)) {
      recordWsRealtimeRoute('chat', 400, connectionId, roomId);
      return { statusCode: 400, body: 'messageId must be a valid UUID' };
    }
    const mgmt = wsManagementClient();
    const ids = await queryConnectionsForRoom(doc, presenceTable, roomId);
    const displayName = presenceDisplayNameForSession(sessionId, conn.displayName);
    const fanSub = fanSubFromConn(conn);
    const avatarUrl = await resolveChatOutboundAvatarUrl(doc, process.env.FAN_PROFILES_TABLE_NAME, fanSub);
    const out: Record<string, unknown> = {
      type: 'chat',
      roomId,
      sessionId,
      displayName,
      text,
      messageId,
      ts: Date.now(),
    };
    if (avatarUrl) {
      out.avatarUrl = avatarUrl;
    }
    const buf = encoder.encode(JSON.stringify(out));
    await postToConnections(mgmt, doc, connTable, ids, buf, undefined, presenceTable);
    recordWsRealtimeRoute('chat', 200, connectionId, roomId, { textLength: text.length });
    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'chat_gif') {
    const fanSubDenied = requireFanSub(conn, 'chat_gif');
    if (fanSubDenied) {
      recordWsRealtimeRoute('chat_gif', 403, connectionId, roomId);
      return fanSubDenied;
    }
    const fanSub = fanSubFromConn(conn);
    const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
    if (!isUuidMessageId(messageId)) {
      recordWsRealtimeRoute('chat_gif', 400, connectionId, roomId);
      return { statusCode: 400, body: 'messageId must be a valid UUID' };
    }
    const giphyId = typeof body.giphyId === 'string' ? body.giphyId.trim() : '';
    if (giphyId === '') {
      recordWsRealtimeRoute('chat_gif', 400, connectionId, roomId, { hasGiphyId: false });
      return { statusCode: 400, body: 'giphyId required' };
    }
    const renditionUrl = typeof body.renditionUrl === 'string' ? body.renditionUrl.trim() : '';
    if (renditionUrl === '' || !isHttpsGiphyCdnUrl(renditionUrl)) {
      recordWsRealtimeRoute('chat_gif', 400, connectionId, roomId, { hasGiphyId: true });
      return { statusCode: 400, body: 'renditionUrl must be HTTPS Giphy CDN URL' };
    }
    let title: string | undefined;
    if (body.title !== undefined) {
      if (typeof body.title !== 'string') {
        recordWsRealtimeRoute('chat_gif', 400, connectionId, roomId, { hasGiphyId: true });
        return { statusCode: 400, body: 'title must be a string' };
      }
      const trimmed = body.title.trim();
      if (trimmed.length > CHAT_GIF_TITLE_MAX) {
        recordWsRealtimeRoute('chat_gif', 400, connectionId, roomId, { hasGiphyId: true });
        return { statusCode: 400, body: `title max ${CHAT_GIF_TITLE_MAX} chars` };
      }
      if (trimmed !== '') {
        title = trimmed;
      }
    }
    const width = parseOptionalChatGifDimension(body.width);
    if (body.width !== undefined && width === undefined) {
      recordWsRealtimeRoute('chat_gif', 400, connectionId, roomId, { hasGiphyId: true });
      return { statusCode: 400, body: 'width must be a positive integer' };
    }
    const height = parseOptionalChatGifDimension(body.height);
    if (body.height !== undefined && height === undefined) {
      recordWsRealtimeRoute('chat_gif', 400, connectionId, roomId, { hasGiphyId: true });
      return { statusCode: 400, body: 'height must be a positive integer' };
    }
    const mgmt = wsManagementClient();
    const ids = await queryConnectionsForRoom(doc, presenceTable, roomId);
    const displayName = presenceDisplayNameForSession(sessionId, conn.displayName);
    const avatarUrl = await resolveChatOutboundAvatarUrl(doc, process.env.FAN_PROFILES_TABLE_NAME, fanSub);
    const out: Record<string, unknown> = {
      type: 'chat_gif',
      roomId,
      sessionId,
      displayName,
      messageId,
      giphyId,
      renditionUrl,
      ts: Date.now(),
    };
    if (title !== undefined) {
      out.title = title;
    }
    if (width !== undefined) {
      out.width = width;
    }
    if (height !== undefined) {
      out.height = height;
    }
    if (avatarUrl) {
      out.avatarUrl = avatarUrl;
    }
    const buf = encoder.encode(JSON.stringify(out));
    await postToConnections(mgmt, doc, connTable, ids, buf, undefined, presenceTable);
    recordWsRealtimeRoute('chat_gif', 200, connectionId, roomId, { hasGiphyId: true });
    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'react') {
    const fanSubDenied = requireFanSub(conn, 'react');
    if (fanSubDenied) {
      recordWsRealtimeRoute('react', 403, connectionId, roomId);
      return fanSubDenied;
    }
    const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
    if (messageId === '' || messageId.length > 64) {
      recordWsRealtimeRoute('react', 400, connectionId, roomId);
      return { statusCode: 400, body: 'messageId required, max 64 chars' };
    }
    const emoji = typeof body.emoji === 'string' ? body.emoji.trim() : '';
    if (emoji === '' || emoji.length > 32) {
      recordWsRealtimeRoute('react', 400, connectionId, roomId);
      return { statusCode: 400, body: 'emoji required, max 32 chars' };
    }
    const reactionAction = body.reactionAction;
    if (reactionAction !== 'add' && reactionAction !== 'remove') {
      recordWsRealtimeRoute('react', 400, connectionId, roomId);
      return { statusCode: 400, body: 'reactionAction must be add or remove' };
    }
    const mgmt = wsManagementClient();
    const ids = await queryConnectionsForRoom(doc, presenceTable, roomId);
    const displayName = presenceDisplayNameForSession(sessionId, conn.displayName);
    const out: Record<string, unknown> = {
      type: 'chat_reaction',
      roomId,
      messageId,
      emoji,
      action: reactionAction,
      sessionId,
      displayName,
      ts: Date.now(),
    };
    const buf = encoder.encode(JSON.stringify(out));
    await postToConnections(mgmt, doc, connTable, ids, buf, undefined, presenceTable);
    recordWsRealtimeRoute('react', 200, connectionId, roomId);
    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'signaling') {
    const envelope = body.envelope;
    if (envelope === undefined) {
      return { statusCode: 400, body: 'envelope required' };
    }

    const hostSubConn = typeof conn.hostSub === 'string' ? conn.hostSub : undefined;
    const isPublisher = Boolean(hostSubConn && hostSubConn === room.hostSub);

    let allowGuestRelay = false;
    if (
      envelope !== null &&
      typeof envelope === 'object' &&
      (envelope as { guestSignaling?: unknown }).guestSignaling === true
    ) {
      const kind = (envelope as { kind?: unknown }).kind;
      allowGuestRelay = kind === 'ready' || kind === 'answer' || kind === 'ice';
    }

    if (!isPublisher && !allowGuestRelay) {
      console.warn(
        JSON.stringify({
          riffsyncDiag: 'ws_signaling',
          outcome: 'forbidden_non_publisher',
          connectionIdTail: connectionId.slice(-12),
          sessionHead: sessionId.slice(0, 8),
          roomIdHead: roomId.slice(0, 8),
          dynamoStoresPublisherRole: Boolean(hostSubConn),
        }),
      );
      return { statusCode: 403, body: 'Publisher JWT required (or guest ready/answer/ice only)' };
    }

    const mgmt = wsManagementClient();
    const ids = await queryConnectionsForRoom(doc, presenceTable, roomId);
    const out = {
      type: 'signaling',
      roomId,
      fromSessionId: sessionId,
      role: isPublisher ? 'host' : 'guest',
      envelope,
    };
    const buf = encoder.encode(JSON.stringify(out));
    await postToConnections(mgmt, doc, connTable, ids, buf, connectionId, presenceTable);
    return { statusCode: 200, body: 'OK' };
  }

  return { statusCode: 400, body: `Unknown route ${routeKey}` };
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  try {
    return await websocketRouteInner(event);
  } catch (err: unknown) {
    const { errorType, errorMessage } = summarizeCaughtErr(err);
    console.error(
      JSON.stringify({
        riffsyncDiag: 'ws_route_uncaught',
        requestIdGw: event.requestContext.requestId,
        connectionId: event.requestContext.connectionId,
        routeKey: event.requestContext.routeKey,
        errorType,
        errorMessage,
      }),
    );
    throw err;
  }
};
