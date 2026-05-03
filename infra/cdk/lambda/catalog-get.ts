import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { projectEpisode } from './catalog-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const tableName = process.env.CATALOG_TABLE_NAME;
  if (!tableName) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing CATALOG_TABLE_NAME' }) };
  }

  const id = event.pathParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing path parameter id' }) };
  }

  const out = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { id },
    }),
  );

  if (!out.Item) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }) };
  }

  const entry = projectEpisode(out.Item as Record<string, unknown>);
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ entry }),
  };
};
