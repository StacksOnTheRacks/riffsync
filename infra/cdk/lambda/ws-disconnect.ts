import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { broadcastRoomPresenceNow } from './ws-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  const presenceTable = process.env.ROOM_PRESENCE_TABLE_NAME;
  if (!connTable || !presenceTable) {
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

  await client.send(
    new DeleteCommand({
      TableName: connTable,
      Key: { connectionId },
    }),
  );

  if (roomId) {
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
  }

  return { statusCode: 200, body: 'Disconnected' };
};
