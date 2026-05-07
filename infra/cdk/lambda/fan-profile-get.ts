import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { FAN_DISPLAY_NAME_MAX_LEN, getJwtSub } from './fan-profile-shared';

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

  const item = out.Item as Record<string, unknown> | undefined;
  if (!item) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ displayName: null, updatedAt: null }),
    };
  }

  const dn = item.displayName;
  const ua = item.updatedAt;
  const displayName = typeof dn === 'string' && dn.trim() !== '' ? dn.trim().slice(0, FAN_DISPLAY_NAME_MAX_LEN) : null;
  const updatedAt = typeof ua === 'number' && Number.isFinite(ua) ? ua : null;

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ displayName, updatedAt }),
  };
};
