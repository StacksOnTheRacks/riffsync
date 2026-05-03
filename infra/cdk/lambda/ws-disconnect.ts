import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  if (!connTable) {
    return { statusCode: 500, body: 'Missing CONNECTIONS_TABLE_NAME' };
  }

  const connectionId = event.requestContext.connectionId;
  await client.send(
    new DeleteCommand({
      TableName: connTable,
      Key: { connectionId },
    }),
  );

  return { statusCode: 200, body: 'Disconnected' };
};
