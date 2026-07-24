import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const fanConnectionsTable = process.env.FAN_CONNECTIONS_TABLE_NAME;
  if (!fanConnectionsTable) {
    return { statusCode: 500, body: 'Missing table env' };
  }

  const connectionId = event.requestContext.connectionId;
  await doc.send(
    new DeleteCommand({
      TableName: fanConnectionsTable,
      Key: { connectionId },
    }),
  );

  console.info(
    JSON.stringify({
      riffsyncDiag: 'fan_dm_ws_disconnect',
      outcome: 'ok',
      connectionIdTail: connectionId.slice(-12),
    }),
  );

  return { statusCode: 200, body: 'Disconnected' };
};
