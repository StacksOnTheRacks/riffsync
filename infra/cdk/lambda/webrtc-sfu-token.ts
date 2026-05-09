import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { verifyAccessToken } from './cognito-jwt';
import { signSfuJoinToken } from './sfu-join-token-sign';
import { queryRoomConnectionItems } from './ws-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sm = new SecretsManagerClient({});

let cachedJoinSecret: string | null = null;

async function joinSecret(): Promise<string> {
  if (cachedJoinSecret) return cachedJoinSecret;
  const arn = process.env.SFU_JOIN_SECRET_ARN;
  if (!arn) throw new Error('Missing SFU_JOIN_SECRET_ARN');
  const out = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = typeof out.SecretString === 'string' ? out.SecretString.trim() : '';
  if (s === '') throw new Error('Empty SFU join secret');
  cachedJoinSecret = s;
  return s;
}

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const connTable = process.env.CONNECTIONS_TABLE_NAME;
  const apiEnv = process.env.RIFFSYNC_API_ENV;
  const publicWsUrl = process.env.SFU_PUBLIC_WS_URL?.trim() ?? '';

  if (!roomsTable || !connTable || (apiEnv !== 'staging' && apiEnv !== 'prod')) {
    return json(500, { error: 'Server misconfigured' });
  }

  if (event.requestContext.http.method !== 'POST') {
    return json(405, { error: 'POST required' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>;
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  if (!roomId) {
    return json(400, { error: 'roomId required' });
  }

  const sessionHeader = event.headers['x-session-id'] ?? event.headers['X-Session-Id'];
  const sessionId = typeof sessionHeader === 'string' ? sessionHeader.trim() : '';
  if (!sessionId) {
    return json(400, { error: 'X-Session-Id header required' });
  }

  const roomOut = await doc.send(
    new GetCommand({
      TableName: roomsTable,
      Key: { roomId },
    }),
  );
  const room = roomOut.Item as Record<string, unknown> | undefined;
  if (!room || typeof room.hostSub !== 'string') {
    return json(404, { error: 'Room not found' });
  }

  const connections = await queryRoomConnectionItems(doc, connTable, roomId);
  const myConn = connections.find((c) => c.sessionId === sessionId);
  if (!myConn) {
    return json(403, { error: 'Open the room WebSocket first (unknown session for this room).' });
  }

  const authHdr = event.headers.authorization ?? event.headers.Authorization;
  const jwtUser = await verifyAccessToken(typeof authHdr === 'string' ? authHdr : undefined);

  const isHostSlot =
    typeof myConn.hostSub === 'string' && myConn.hostSub === room.hostSub && jwtUser?.sub === room.hostSub;

  const role: 'producer' | 'consumer' = isHostSlot ? 'producer' : 'consumer';

  const now = Math.floor(Date.now() / 1000);
  const ttlSec = 600;
  const secret = await joinSecret();
  const token = signSfuJoinToken(
    {
      env: apiEnv,
      roomId,
      sessionId,
      role,
      iat: now,
      exp: now + ttlSec,
    },
    secret,
  );

  return json(200, {
    token,
    role,
    wsUrl: publicWsUrl || undefined,
    expiresInSeconds: ttlSec,
  });
};
