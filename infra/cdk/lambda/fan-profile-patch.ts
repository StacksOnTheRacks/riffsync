import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!('displayName' in body)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'displayName is required' }),
    };
  }

  const raw = body.displayName;
  if (typeof raw !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'displayName must be a string' }) };
  }

  const displayName = raw.trim().slice(0, FAN_DISPLAY_NAME_MAX_LEN);
  if (displayName === '') {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'displayName cannot be empty' }),
    };
  }

  const updatedAt = Date.now();

  await client.send(
    new UpdateCommand({
      TableName: table,
      Key: { sub: jwtSub },
      UpdateExpression: 'SET displayName = :dn, updatedAt = :ua',
      ExpressionAttributeValues: {
        ':dn': displayName,
        ':ua': updatedAt,
      },
    }),
  );

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ displayName, updatedAt }),
  };
};
