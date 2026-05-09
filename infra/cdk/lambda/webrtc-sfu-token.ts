import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { verifyAccessToken } from './cognito-jwt';
import { signSfuJoinToken } from './sfu-join-token-sign';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sm = new SecretsManagerClient({});

/** Avoid `Record<string, unknown>` in value positions: esbuild JSX parse can mis-read `<`. */
type JsonRecord = { [key: string]: unknown };

let cachedJoinSecret: string | null = null;

async function joinSecret(): Promise<string> {
  if (cachedJoinSecret) return cachedJoinSecret;
  /** Prefer friendly **name**; CDK `fromSecretNameV2` can pass partial ARNs with `??????` suffix tokens that break IAM matching. */
  const secretId =
    process.env.SFU_JOIN_SECRET_ID?.trim() || process.env.SFU_JOIN_SECRET_ARN?.trim();
  if (!secretId) throw new Error('Missing SFU_JOIN_SECRET_ID or SFU_JOIN_SECRET_ARN');
  const out = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
  const s = typeof out.SecretString === 'string' ? out.SecretString.trim() : '';
  if (s === '') throw new Error('Empty SFU join secret');
  cachedJoinSecret = s;
  return s;
}

function json(statusCode: number, body: JsonRecord): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

async function findMyConnectionRow(
  presenceTable: string,
  roomId: string,
  sessionId: string,
): Promise<JsonRecord | undefined> {
  const out = await doc.send(
    new QueryCommand({
      TableName: presenceTable,
      KeyConditionExpression: 'roomId = :r AND begins_with(presenceKey, :pk)',
      ExpressionAttributeValues: {
        ':r': roomId,
        ':pk': `${sessionId.trim()}#`,
      },
      ConsistentRead: true,
    }),
  );
  return (out.Items ?? [])[0] as JsonRecord | undefined;
}

async function handleSfuToken(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const headers = event.headers ?? {};
  const roomsTable = process.env.ROOMS_TABLE_NAME;
  const presenceTable = process.env.ROOM_PRESENCE_TABLE_NAME;
  const apiEnv = process.env.RIFFSYNC_API_ENV;
  const publicWsUrl = process.env.SFU_PUBLIC_WS_URL?.trim() ?? '';

  if (!roomsTable || !presenceTable || apiEnv !== 'prod') {
    return json(500, { error: 'Server misconfigured' });
  }

  if (event.requestContext?.http?.method !== 'POST') {
    return json(405, { error: 'POST required' });
  }

  let body: JsonRecord;
  try {
    body = JSON.parse(event.body ?? '{}') as JsonRecord;
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
  if (!roomId) {
    return json(400, { error: 'roomId required' });
  }

  const sessionHeader = headers['x-session-id'] ?? headers['X-Session-Id'];
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
  const room = roomOut.Item as JsonRecord | undefined;
  if (!room || typeof room.hostSub !== 'string') {
    return json(404, { error: 'Room not found' });
  }

  const myConn = await findMyConnectionRow(presenceTable, roomId, sessionId);
  if (!myConn) {
    return json(403, { error: 'Open the room WebSocket first (unknown session for this room).' });
  }

  const authHdr = headers.authorization ?? headers.Authorization;
  const jwtUser = await verifyAccessToken(typeof authHdr === 'string' ? authHdr : undefined);

  const isHostSlot =
    typeof myConn.hostSub === 'string' && myConn.hostSub === room.hostSub && jwtUser?.sub === room.hostSub;

  const role: 'producer' | 'consumer' = isHostSlot ? 'producer' : 'consumer';

  const now = Math.floor(Date.now() / 1000);
  const ttlSec = 900;
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
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    return await handleSfuToken(event);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : 'Error';
    console.error(JSON.stringify({ riffsyncDiag: 'webrtc_sfu_token_unhandled', name, msg }));
    return json(500, {
      error: 'sfu_token_failed',
      /** Safe to surface to clients (no secret values); check CloudWatch for full **`name`** / **`msg`**. */
      detail: msg.length > 240 ? `${msg.slice(0, 240)}…` : msg,
    });
  }
};
