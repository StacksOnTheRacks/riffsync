import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyAccessToken } from './cognito-jwt';
import { broadcastRoomPresenceWithGsiRetry } from './ws-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  if (!roomsTable || !connTable) {
    return { statusCode: 500, body: 'Missing table env' };
  }

  const connectionId = event.requestContext.connectionId;
  const apiStage = typeof event.requestContext.stage === 'string' ? event.requestContext.stage : undefined;
  const roomId = event.queryStringParameters?.roomId;
  const sessionId = event.queryStringParameters?.sessionId;
  const displayNameRaw = event.queryStringParameters?.displayName;
  const displayName =
    typeof displayNameRaw === 'string' && displayNameRaw.trim() !== '' ? displayNameRaw.trim().slice(0, 48) : undefined;
  if (!roomId || !sessionId || roomId.trim() === '' || sessionId.trim() === '') {
    console.warn(
      JSON.stringify({
        riffsyncDiag: 'ws_connect',
        outcome: 'bad_request_missing_query',
        connectionIdTail: connectionId.slice(-12),
        apiStage,
      }),
    );
    return { statusCode: 400, body: 'Missing roomId or sessionId query parameter' };
  }

  const roomOut = await client.send(
    new GetCommand({
      TableName: roomsTable,
      Key: { roomId },
    }),
  );
  const room = roomOut.Item as Record<string, unknown> | undefined;
  if (!room || typeof room.hostSub !== 'string') {
    console.warn(
      JSON.stringify({
        riffsyncDiag: 'ws_connect',
        outcome: 'room_not_found',
        connectionIdTail: connectionId.slice(-12),
        roomIdHead: roomId.slice(0, 8),
        apiStage,
      }),
    );
    return { statusCode: 404, body: 'Room not found' };
  }

  /** Browsers cannot set `Authorization` on WebSocket handshakes; accept raw JWT query as fallback (see `docs/contracts.websocket.md`). */
  const qpToken = event.queryStringParameters?.accessToken;
  const headerAuth = event.headers?.Authorization ?? event.headers?.authorization;
  const authHdr =
    typeof qpToken === 'string' && qpToken.trim().length > 0
      ? qpToken.startsWith('Bearer ')
        ? qpToken
        : `Bearer ${qpToken.trim()}`
      : headerAuth;

  const jwtUser = await verifyAccessToken(authHdr);
  let hostSub: string | undefined;
  if (jwtUser) {
    if (jwtUser.sub !== room.hostSub) {
      console.warn(
        JSON.stringify({
          riffsyncDiag: 'ws_connect',
          outcome: 'forbidden_jwt_sub_mismatch_room_host',
          connectionIdTail: connectionId.slice(-12),
          roomIdHead: roomId.slice(0, 8),
          apiStage,
          jwtVerified: true,
        }),
      );
      return { statusCode: 403, body: 'JWT.sub does not match room hostSub' };
    }
    hostSub = jwtUser.sub;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ttl = nowSec + 7 * 24 * 3600;

  await client.send(
    new PutCommand({
      TableName: connTable,
      Item: {
        connectionId,
        roomId,
        sessionId,
        ...(displayName ? { displayName } : {}),
        ...(hostSub ? { hostSub } : {}),
        connectedAt: nowSec,
        expiresAt: ttl,
      },
    }),
  );

  console.info(
    JSON.stringify({
      riffsyncDiag: 'ws_connect',
      outcome: 'ok',
      connectionIdTail: connectionId.slice(-12),
      roomIdHead: roomId.slice(0, 8),
      sessionIdHead: sessionId.slice(0, 8),
      apiStage,
      bearerPresent: Boolean(authHdr && authHdr.length > 'Bearer '.length),
      jwtVerifiedOk: jwtUser !== null,
      dynamoStoresPublisherRole: Boolean(hostSub),
    }),
  );

  await broadcastRoomPresenceWithGsiRetry({ doc: client, connectionsTable: connTable, roomId }).catch(() => undefined);

  return { statusCode: 200, body: 'Connected' };
};
