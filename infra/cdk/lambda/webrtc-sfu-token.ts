import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { verifyAccessToken } from './cognito-jwt';
import { readAvDisabled } from './room-get';
import { signSfuJoinToken, type SfuProducerClass } from './sfu-join-token-sign';
import { queryRoomPresenceItems } from './ws-shared';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sm = new SecretsManagerClient({});

/** Avoid `Record<string, unknown>` in value positions: esbuild JSX parse can mis-read `<`. */
type JsonRecord = { [key: string]: unknown };

type GrantResult =
  | {
      role: 'producer';
      producerClasses: SfuProducerClass[];
      fanSub?: string;
    }
  | { role: 'consumer' };

type DenialResult = {
  status: 403 | 429;
  code:
    | 'av_disabled'
    | 'fan_auth_required'
    | 'not_host'
    | 'unknown_session'
    | 'publisher_cap_exceeded'
    | 'rate_limited';
  error: string;
};

let cachedJoinSecret: string | null = null;

const PARTICIPANT_MINTS_PER_MINUTE = 30;
const rateBuckets = new Map<string, { count: number; windowStartMs: number }>();

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

function riffsyncEnvironment(): string {
  return process.env.RIFFSYNC_ENVIRONMENT?.trim() || 'unknown';
}

/** EMF counter via stdout (no PutMetricData IAM required). */
function emitSfuTokenDenied(reason: DenialResult['code']): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'RiffSync/Media',
            Dimensions: [['Environment', 'Reason']],
            Metrics: [{ Name: 'SfuTokenDenied', Unit: 'Count' }],
          },
        ],
      },
      Environment: riffsyncEnvironment(),
      Reason: reason,
      SfuTokenDenied: 1,
    }),
  );
}

function deny(denial: DenialResult): APIGatewayProxyResultV2 {
  emitSfuTokenDenied(denial.code);
  return json(denial.status, { error: denial.error, code: denial.code });
}

function maxParticipantAvPublishers(): number {
  const perRoom = Number.parseInt(process.env.SFU_MAX_PRODUCERS_PER_ROOM ?? '24', 10);
  /** Business cap: ~8 concurrent fan publishers; derive from room producer ceiling. */
  return Math.min(8, Math.max(1, Math.floor(perRoom / 3)));
}

function parseProducerClass(value: unknown): SfuProducerClass | null {
  if (value === 'host_screen' || value === 'participant_av') return value;
  return null;
}

type ProducerIntent =
  | { kind: 'consumer' }
  | { kind: 'invalid' }
  | { kind: 'producer'; requestedClasses: SfuProducerClass[] };

function parseProducerIntent(body: JsonRecord): ProducerIntent {
  const hasLegacy = Object.prototype.hasOwnProperty.call(body, 'producerClass');
  const hasArray = Object.prototype.hasOwnProperty.call(body, 'producerClasses');

  if (!hasLegacy && !hasArray) {
    return { kind: 'consumer' };
  }

  if (hasArray) {
    const raw = body.producerClasses;
    if (!Array.isArray(raw) || raw.length === 0) return { kind: 'invalid' };
    const classes: SfuProducerClass[] = [];
    for (const entry of raw) {
      const parsed = parseProducerClass(entry);
      if (!parsed) return { kind: 'invalid' };
      if (!classes.includes(parsed)) classes.push(parsed);
    }
    return { kind: 'producer', requestedClasses: classes };
  }

  const legacy = parseProducerClass(body.producerClass);
  if (!legacy) return { kind: 'invalid' };
  return { kind: 'producer', requestedClasses: [legacy] };
}

function fanSubFromConn(conn: JsonRecord): string {
  return typeof conn.fanSub === 'string' ? conn.fanSub.trim() : '';
}

function checkParticipantMintRateLimit(fanSub: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  let bucket = rateBuckets.get(fanSub);
  if (!bucket || now - bucket.windowStartMs >= windowMs) {
    bucket = { count: 0, windowStartMs: now };
    rateBuckets.set(fanSub, bucket);
  }
  if (bucket.count >= PARTICIPANT_MINTS_PER_MINUTE) {
    return false;
  }
  bucket.count += 1;
  return true;
}

async function distinctFanSubsInRoom(presenceTable: string, roomId: string): Promise<Set<string>> {
  const items = await queryRoomPresenceItems(doc, presenceTable, roomId);
  const subs = new Set<string>();
  for (const it of items) {
    const fanSub = fanSubFromConn(it);
    if (fanSub) subs.add(fanSub);
  }
  return subs;
}

function lastSeenAtOf(conn: JsonRecord): number {
  const n = conn.lastSeenAt;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function pickNewestConnectionRow(items: JsonRecord[]): JsonRecord {
  return [...items].sort((a, b) => lastSeenAtOf(b) - lastSeenAtOf(a))[0]!;
}

async function findMyConnectionRow(
  presenceTable: string,
  roomId: string,
  sessionId: string,
  jwtUser?: { sub: string } | null,
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
  const items = (out.Items ?? []) as JsonRecord[];
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0];

  if (jwtUser) {
    const matchingFanSub = items.filter((it) => fanSubFromConn(it) === jwtUser.sub);
    if (matchingFanSub.length > 0) {
      return pickNewestConnectionRow(matchingFanSub);
    }
  }

  const withFanSub = items.filter((it) => fanSubFromConn(it) !== '');
  if (withFanSub.length > 0) {
    return pickNewestConnectionRow(withFanSub);
  }

  return pickNewestConnectionRow(items);
}

async function resolveParticipantAvGrant(
  room: JsonRecord,
  presenceTable: string,
  roomId: string,
  jwtUser: { sub: string } | null,
  connFanSub: string,
): Promise<GrantResult | DenialResult> {
  /** WS `$connect` may omit `fanSub` when the JWT query param fails verification; HTTP `Authorization` is authoritative here. */
  const effectiveFanSub = connFanSub || (jwtUser?.sub ?? '');
  if (!jwtUser || !effectiveFanSub || jwtUser.sub !== effectiveFanSub) {
    return {
      status: 403,
      code: 'fan_auth_required',
      error: 'Sign in to publish camera or microphone in this room.',
    };
  }
  if (readAvDisabled(room)) {
    return {
      status: 403,
      code: 'av_disabled',
      error: 'The host turned room A/V off.',
    };
  }
  if (!checkParticipantMintRateLimit(effectiveFanSub)) {
    return {
      status: 429,
      code: 'rate_limited',
      error: 'Too many participant A/V token requests. Try again shortly.',
    };
  }
  const fanSubs = await distinctFanSubsInRoom(presenceTable, roomId);
  const cap = maxParticipantAvPublishers();
  if (!fanSubs.has(effectiveFanSub) && fanSubs.size >= cap) {
    return {
      status: 403,
      code: 'publisher_cap_exceeded',
      error: 'This room has reached the maximum number of live cameras and microphones.',
    };
  }
  return { role: 'producer', producerClasses: ['participant_av'], fanSub: effectiveFanSub };
}

function hostProducerClasses(room: JsonRecord): SfuProducerClass[] {
  if (readAvDisabled(room)) {
    return ['host_screen'];
  }
  return ['host_screen', 'participant_av'];
}

async function resolveGrant(
  intent: ProducerIntent,
  room: JsonRecord,
  presenceTable: string,
  roomId: string,
  jwtUser: { sub: string } | null,
  myConn: JsonRecord,
): Promise<GrantResult | DenialResult> {
  const roomHostSub = room.hostSub as string;
  const connFanSub = fanSubFromConn(myConn);
  const isHostJwt = jwtUser?.sub === roomHostSub;

  if (intent.kind === 'consumer') {
    return { role: 'consumer' };
  }
  if (intent.kind === 'invalid') {
    return {
      status: 403,
      code: 'fan_auth_required',
      error: 'Invalid producerClasses request.',
    };
  }

  const requested = intent.requestedClasses;
  const wantsHostScreen = requested.includes('host_screen');
  const wantsParticipantAv = requested.includes('participant_av');

  if (wantsHostScreen) {
    /** HTTP Authorization is authoritative; WS `$connect` may omit `hostSub` when the query JWT fails. */
    if (!isHostJwt) {
      return {
        status: 403,
        code: 'not_host',
        error: 'Only the room host may publish screen share.',
      };
    }
    if (wantsParticipantAv) {
      if (readAvDisabled(room)) {
        return { role: 'producer', producerClasses: ['host_screen'] };
      }
      const avGrant = await resolveParticipantAvGrant(
        room,
        presenceTable,
        roomId,
        jwtUser,
        connFanSub,
      );
      if ('code' in avGrant) {
        if (avGrant.code === 'av_disabled') {
          return { role: 'producer', producerClasses: ['host_screen'] };
        }
        return avGrant;
      }
      return { role: 'producer', producerClasses: hostProducerClasses(room), fanSub: avGrant.fanSub };
    }
    return { role: 'producer', producerClasses: ['host_screen'] };
  }

  if (wantsParticipantAv) {
    if (isHostJwt) {
      const avGrant = await resolveParticipantAvGrant(
        room,
        presenceTable,
        roomId,
        jwtUser,
        connFanSub,
      );
      if ('code' in avGrant) return avGrant;
      return { role: 'producer', producerClasses: hostProducerClasses(room), fanSub: avGrant.fanSub };
    }
    return resolveParticipantAvGrant(room, presenceTable, roomId, jwtUser, connFanSub);
  }

  return { role: 'consumer' };
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

  const producerIntent = parseProducerIntent(body);
  if (producerIntent.kind === 'invalid') {
    return json(400, {
      error: 'producerClasses must be a non-empty array of host_screen and/or participant_av',
    });
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

  const authHdr = headers.authorization ?? headers.Authorization;
  const jwtUser = await verifyAccessToken(typeof authHdr === 'string' ? authHdr : undefined);

  const myConn = await findMyConnectionRow(presenceTable, roomId, sessionId, jwtUser);
  if (!myConn) {
    return deny({
      status: 403,
      code: 'unknown_session',
      error: 'Open the room WebSocket first (unknown session for this room).',
    });
  }

  const grant = await resolveGrant(producerIntent, room, presenceTable, roomId, jwtUser, myConn);
  if ('code' in grant) {
    return deny(grant);
  }

  const now = Math.floor(Date.now() / 1000);
  const ttlSec = 900;
  const secret = await joinSecret();
  const token = signSfuJoinToken(
    {
      env: apiEnv,
      roomId,
      sessionId,
      role: grant.role,
      ...(grant.role === 'producer'
        ? {
            producerClasses: grant.producerClasses,
            ...(grant.fanSub ? { fanSub: grant.fanSub } : {}),
          }
        : {}),
      iat: now,
      exp: now + ttlSec,
    },
    secret,
  );

  const response: JsonRecord = {
    token,
    role: grant.role,
    wsUrl: publicWsUrl || undefined,
    expiresInSeconds: ttlSec,
  };
  if (grant.role === 'producer') {
    response.producerClasses = grant.producerClasses;
    if (grant.producerClasses.length === 1) {
      response.producerClass = grant.producerClasses[0];
    }
  }

  return json(200, response);
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

/** Test-only reset for in-memory rate limit state. */
export function __resetParticipantMintRateLimitsForTests(): void {
  rateBuckets.clear();
}
