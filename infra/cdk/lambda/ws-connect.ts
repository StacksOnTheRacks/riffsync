import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyAccessToken } from './cognito-jwt';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  if (!roomsTable || !connTable) {
    return { statusCode: 500, body: 'Missing table env' };
  }

  const connectionId = event.requestContext.connectionId;
  const roomId = event.queryStringParameters?.roomId;
  const sessionId = event.queryStringParameters?.sessionId;
  if (!roomId || !sessionId || roomId.trim() === '' || sessionId.trim() === '') {
    return { statusCode: 400, body: 'Missing roomId or sessionId query parameter' };
  }

  const roomOut = await client.send(
    new GetCommand({
      TableName: roomsTable,
      Key: { roomId },
    }),
  );
  const room = roomOut.Item as Record<string, unknown> | undefined;
  if (!room || typeof room.hostSub !== 'string') {
    return { statusCode: 404, body: 'Room not found' };
  }

  const authHdr = event.headers?.Authorization ?? event.headers?.authorization;
  const jwtUser = await verifyAccessToken(authHdr);
  let hostSub: string | undefined;
  if (jwtUser) {
    if (jwtUser.sub !== room.hostSub) {
      return { statusCode: 403, body: 'JWT.sub does not match room hostSub' };
    }
    hostSub = jwtUser.sub;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ttl = nowSec + 7 * 24 * 3600;

  await client.send(
    new PutCommand({
      TableName: connTable,
      Item: {
        connectionId,
        roomId,
        sessionId,
        ...(hostSub ? { hostSub } : {}),
        connectedAt: nowSec,
        expiresAt: ttl,
      },
    }),
  );

  return { statusCode: 200, body: 'Connected' };
};
