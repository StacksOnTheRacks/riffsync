import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { turnRestCredential, turnRestUsername } from './webrtc-turn-credentials';

const secrets = new SecretsManagerClient({});

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

let cachedSecret: { value: string; cachedAtMs: number } | null = null;
const SECRET_CACHE_MS = 60_000;

function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

function isPlaceholderTurnSecret(s: string): boolean {
  const t = s.trim();
  return t.length < 16 || t.includes('REPLACE_WITH_TURN');
}

function parseStunServers(raw: string): IceServer[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') return null;
      const urls = (entry as IceServer).urls;
      if (typeof urls === 'string') continue;
      if (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string')) return null;
    }
    return parsed as IceServer[];
  } catch {
    return null;
  }
}

async function loadSharedSecret(arn: string): Promise<string | null> {
  const now = Date.now();
  if (cachedSecret && now - cachedSecret.cachedAtMs < SECRET_CACHE_MS) {
    return cachedSecret.value;
  }
  try {
    const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
    const raw = out.SecretString?.trim();
    if (!raw) return null;
    cachedSecret = { value: raw, cachedAtMs: now };
    return raw;
  } catch (e) {
    console.error('turn secret read failed', e);
    return null;
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const stunRaw = process.env.STUN_SERVERS_JSON;
  if (!stunRaw) {
    return jsonResponse(500, { error: 'Server misconfigured' });
  }
  const stunServers = parseStunServers(stunRaw);
  if (!stunServers) {
    console.error('invalid STUN_SERVERS_JSON');
    return jsonResponse(500, { error: 'Server misconfigured' });
  }

  const turnHost = (process.env.TURN_HOST ?? '').trim();
  if (!turnHost) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ version: 1, iceServers: stunServers }),
    };
  }

  const secretArn = process.env.TURN_SHARED_SECRET_ARN;
  if (!secretArn) {
    return jsonResponse(500, { error: 'Server misconfigured' });
  }

  const secret = await loadSharedSecret(secretArn);
  if (!secret || isPlaceholderTurnSecret(secret)) {
    console.error('turn shared secret missing or placeholder');
    return jsonResponse(503, { error: 'ice_unavailable' });
  }

  const ttlRaw = process.env.TURN_CREDENTIAL_TTL_SECONDS ?? '43200';
  const ttl = Number.parseInt(ttlRaw, 10);
  if (!Number.isFinite(ttl) || ttl < 300) {
    return jsonResponse(500, { error: 'Server misconfigured' });
  }
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const username = turnRestUsername(expiry, 'riffsync');
  const credential = turnRestCredential(secret, username);

  const port = (process.env.TURN_PORT ?? '3478').trim() || '3478';
  const tlsPort = (process.env.TURN_TLS_PORT ?? '443').trim();
  const tcp443Port = (process.env.TURN_TCP443_PORT ?? '443').trim();

  const urls: string[] = [
    `turn:${turnHost}:${port}?transport=udp`,
    `turn:${turnHost}:${port}?transport=tcp`,
    `turn:${turnHost}:${tcp443Port}?transport=tcp`,
  ];
  if (tlsPort !== '') {
    urls.push(`turns:${turnHost}:${tlsPort}?transport=tcp`);
  }

  const iceServers: IceServer[] = [
    ...stunServers,
    {
      urls,
      username,
      credential,
    },
  ];

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ version: 1, iceServers }),
  };
};
