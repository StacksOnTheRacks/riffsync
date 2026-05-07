import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { TextEncoder } from 'node:util';
import { lobbySortKey, LOBBY_PARTITION } from './room-shared';
import {
  broadcastRoomPresence,
  postToConnections,
  presenceDisplayNameForSession,
  queryConnectionsForRoom,
  wsManagementClient,
} from './ws-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const encoder = new TextEncoder();

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
  if (!roomsTable || !connTable) {
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
    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'presence_request') {
    await broadcastRoomPresence({ doc, connectionsTable: connTable, roomId }).catch(() => undefined);
    return { statusCode: 200, body: 'OK' };
  }

  if (routeKey === 'chat') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text === '' || text.length > 2000) {
      return { statusCode: 400, body: 'text required, max 2000 chars' };
    }
    const mgmt = wsManagementClient();
    const ids = await queryConnectionsForRoom(doc, connTable, roomId);
    const displayName = presenceDisplayNameForSession(sessionId, conn.displayName);
    const out = {
      type: 'chat',
      roomId,
      sessionId,
      displayName,
      text,
      ts: Date.now(),
    };
    const buf = encoder.encode(JSON.stringify(out));
    await postToConnections(mgmt, doc, connTable, ids, buf);
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
    const ids = await queryConnectionsForRoom(doc, connTable, roomId);
    const out = {
      type: 'signaling',
      roomId,
      fromSessionId: sessionId,
      role: isPublisher ? 'host' : 'guest',
      envelope,
    };
    const buf = encoder.encode(JSON.stringify(out));
    await postToConnections(mgmt, doc, connTable, ids, buf, connectionId);
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
