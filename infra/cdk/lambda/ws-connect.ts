import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { verifyAccessToken } from './cognito-jwt';
import { maintainPublicLobbyOnHostConnect } from './room-lobby-cleanup';
import { fanOutChatSystem, isWithinJoinReconnectCooldown } from './ws-chat-system-shared';
import { fanSubRoomPresenceSk } from './room-presence-shared';
import { broadcastRoomPresenceNow, presenceDisplayNameForSession } from './ws-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  const presenceTable = process.env.ROOM_PRESENCE_TABLE_NAME;
  if (!roomsTable || !connTable || !presenceTable) {
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
  let fanSub: string | undefined;
  if (jwtUser) {
    fanSub = jwtUser.sub;
    if (jwtUser.sub === room.hostSub) {
      hostSub = jwtUser.sub;
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);
  /** Refreshed on each `ping`; zombies disappear within ~90m of last heartbeat if `$disconnect` never runs. */
  const ttl = nowSec + 90 * 60;
  const presenceKey = `${sessionId}#${connectionId}`;

  const presenceItem = {
    connectionId,
    roomId,
    presenceKey,
    sessionId,
    ...(displayName ? { displayName } : {}),
    ...(fanSub
      ? { fanSub, fanSubRoomSk: fanSubRoomPresenceSk(roomId, presenceKey), lastActiveAt: nowSec }
      : {}),
    ...(hostSub ? { hostSub } : {}),
    connectedAt: nowSec,
    lastSeenAt: nowSec,
    expiresAt: ttl,
  };

  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: connTable,
            Item: presenceItem,
          },
        },
        {
          Put: {
            TableName: presenceTable,
            Item: presenceItem,
          },
        },
      ],
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
      dynamoStoresFanSub: Boolean(fanSub),
      dynamoStoresPublisherRole: Boolean(hostSub),
    }),
  );

  if (hostSub) {
    await maintainPublicLobbyOnHostConnect({ doc: client, roomsTable, roomId, room }).catch(
      () => undefined,
    );
  }

  await broadcastRoomPresenceNow({
    doc: client,
    connectionsTable: connTable,
    roomPresenceTable: presenceTable,
    roomId,
    except: connectionId,
  }).catch(() => undefined);

  if (fanSub) {
    const inCooldown = await isWithinJoinReconnectCooldown(client, presenceTable, roomId, fanSub, nowSec).catch(
      () => false,
    );
    if (!inCooldown) {
      const rosterDisplayName = presenceDisplayNameForSession(sessionId, displayName);
      await fanOutChatSystem({
        doc: client,
        connectionsTable: connTable,
        presenceTable,
        roomId,
        sessionId,
        displayName: rosterDisplayName,
        event: 'join',
        except: connectionId,
      }).catch(() => undefined);
    }
  }

  return { statusCode: 200, body: 'Connected' };
};
