import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { broadcastRoomPresenceWithGsiRetry } from './ws-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  if (!connTable) {
    return { statusCode: 500, body: 'Missing CONNECTIONS_TABLE_NAME' };
  }

  const connectionId = event.requestContext.connectionId;

  const prior = await client.send(
    new GetCommand({
      TableName: connTable,
      Key: { connectionId },
    }),
  );
  const roomId = typeof prior.Item?.roomId === 'string' ? prior.Item.roomId : undefined;

  await client.send(
    new DeleteCommand({
      TableName: connTable,
      Key: { connectionId },
    }),
  );

  if (roomId) {
    await broadcastRoomPresenceWithGsiRetry({ doc: client, connectionsTable: connTable, roomId }).catch(
      () => undefined,
    );
  }

  return { statusCode: 200, body: 'Disconnected' };
};
