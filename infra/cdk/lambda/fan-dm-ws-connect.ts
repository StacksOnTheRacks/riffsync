import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyAccessToken } from './cognito-jwt';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const fanConnectionsTable = process.env.FAN_CONNECTIONS_TABLE_NAME;
  if (!fanConnectionsTable) {
    return { statusCode: 500, body: 'Missing table env' };
  }

  const connectionId = event.requestContext.connectionId;
  const qpToken = event.queryStringParameters?.accessToken;
  const headerAuth = event.headers?.Authorization ?? event.headers?.authorization;
  const authHdr =
    typeof qpToken === 'string' && qpToken.trim().length > 0
      ? qpToken.startsWith('Bearer ')
        ? qpToken
        : `Bearer ${qpToken.trim()}`
      : headerAuth;

  const jwtUser = await verifyAccessToken(authHdr);
  if (!jwtUser) {
    console.warn(
      JSON.stringify({
        riffsyncDiag: 'fan_dm_ws_connect',
        outcome: 'fan_auth_required',
        connectionIdTail: connectionId.slice(-12),
      }),
    );
    return { statusCode: 401, body: 'Fan authentication required' };
  }

  const sessionIdRaw = event.queryStringParameters?.sessionId;
  const sessionId =
    typeof sessionIdRaw === 'string' && sessionIdRaw.trim() !== '' ? sessionIdRaw.trim().slice(0, 64) : undefined;
  const nowSec = Math.floor(Date.now() / 1000);
  const ttl = nowSec + 90 * 60;

  await doc.send(
    new PutCommand({
      TableName: fanConnectionsTable,
      Item: {
        connectionId,
        fanSub: jwtUser.sub,
        connectedAt: nowSec,
        expiresAt: ttl,
        ...(sessionId ? { sessionId } : {}),
      },
    }),
  );

  console.info(
    JSON.stringify({
      riffsyncDiag: 'fan_dm_ws_connect',
      outcome: 'ok',
      connectionIdTail: connectionId.slice(-12),
      fanSubHead: jwtUser.sub.slice(0, 8),
    }),
  );

  return { statusCode: 200, body: 'Connected' };
};
