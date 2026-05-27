import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getJwtSub, serializeFanProfile } from './fan-profile-shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const table = process.env.FAN_PROFILES_TABLE_NAME;
  if (!table) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing FAN_PROFILES_TABLE_NAME' }) };
  }

  const jwtSub = getJwtSub(event);
  if (!jwtSub) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const out = await client.send(
    new GetCommand({
      TableName: table,
      Key: { sub: jwtSub },
    }),
  );

  const profile = serializeFanProfile(out.Item as Record<string, unknown> | undefined);

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(profile),
  };
};
