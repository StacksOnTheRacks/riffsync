import { createHmac, timingSafeEqual } from 'node:crypto';

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBuffer(s: string): Buffer {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  return Buffer.from(b64, 'base64');
}

export type SfuJoinClaims = {
  env: string;
  roomId: string;
  sessionId: string;
  role: 'producer' | 'consumer';
  iat: number;
  exp: number;
};

export function verifySfuJoinToken(token: string, secret: string): SfuJoinClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expectedSig = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  let got: Buffer;
  try {
    got = base64UrlToBuffer(s);
  } catch {
    return null;
  }
  const expBuf = expectedSig;
  if (got.length !== expBuf.length || !timingSafeEqual(got, expBuf)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const o = payload as Record<string, unknown>;
  if (typeof o.env !== 'string' || o.env.trim() === '') return null;
  if (typeof o.roomId !== 'string' || o.roomId.trim() === '') return null;
  if (typeof o.sessionId !== 'string' || o.sessionId.trim() === '') return null;
  if (o.role !== 'producer' && o.role !== 'consumer') return null;
  if (typeof o.iat !== 'number' || typeof o.exp !== 'number') return null;
  const now = Math.floor(Date.now() / 1000);
  if (o.exp < now) return null;
  return {
    env: o.env.trim(),
    roomId: o.roomId.trim(),
    sessionId: o.sessionId.trim(),
    role: o.role,
    iat: o.iat,
    exp: o.exp,
  };
}
