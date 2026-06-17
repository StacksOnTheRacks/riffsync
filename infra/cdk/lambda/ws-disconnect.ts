import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { markLobbyCleanupPendingIfLastHostGone } from './room-lobby-cleanup';
import { fanOutChatSystem, recordFanDisconnectJoinCooldown } from './ws-chat-system-shared';
import { fanOutTyping } from './ws-typing-shared';
import { broadcastRoomPresenceNow, presenceDisplayNameForSession } from './ws-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  const presenceTable = process.env.ROOM_PRESENCE_TABLE_NAME;
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  if (!connTable || !presenceTable || !roomsTable) {
    return { statusCode: 500, body: 'Missing table env' };
  }

  const connectionId = event.requestContext.connectionId;

  const prior = await client.send(
    new GetCommand({
      TableName: connTable,
      Key: { connectionId },
    }),
  );
  const roomId = typeof prior.Item?.roomId === 'string' ? prior.Item.roomId : undefined;
  const presenceKey = typeof prior.Item?.presenceKey === 'string' ? prior.Item.presenceKey : undefined;
  const sessionId = typeof prior.Item?.sessionId === 'string' ? prior.Item.sessionId : undefined;
  const fanSub = typeof prior.Item?.fanSub === 'string' ? prior.Item.fanSub : undefined;
  const displayNameAttr = prior.Item?.displayName;
  const departingWasHost =
    typeof prior.Item?.hostSub === 'string' && (prior.Item.hostSub as string).length > 0;

  await client.send(
    new DeleteCommand({
      TableName: connTable,
      Key: { connectionId },
    }),
  );

  if (roomId) {
    if (fanSub) {
      await recordFanDisconnectJoinCooldown(client, presenceTable, roomId, fanSub).catch(() => undefined);
    }

    if (sessionId) {
      const displayName = presenceDisplayNameForSession(sessionId, displayNameAttr);
      if (fanSub) {
        await fanOutChatSystem({
          doc: client,
          connectionsTable: connTable,
          presenceTable,
          roomId,
          sessionId,
          displayName,
          event: 'leave',
        }).catch(() => undefined);
      }
      await fanOutTyping({
        doc: client,
        connectionsTable: connTable,
        presenceTable,
        roomId,
        sessionId,
        displayName,
        action: 'stop',
      }).catch(() => undefined);
    }

    await client
      .send(
        new DeleteCommand({
          TableName: presenceTable,
          Key: { roomId, presenceKey: presenceKey ?? connectionId },
        }),
      )
      .catch(() => undefined);
    await broadcastRoomPresenceNow({ doc: client, connectionsTable: connTable, roomPresenceTable: presenceTable, roomId }).catch(
      () => undefined,
    );
    await markLobbyCleanupPendingIfLastHostGone({
      doc: client,
      roomsTable,
      roomPresenceTable: presenceTable,
      roomId,
      departingWasHost,
    }).catch(() => undefined);
  }

  return { statusCode: 200, body: 'Disconnected' };
};
