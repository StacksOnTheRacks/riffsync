import { createHmac } from 'node:crypto';

function base64UrlEncodeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlEncodeBytes(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export type SfuJoinPayload = {
  env: string;
  roomId: string;
  sessionId: string;
  role: 'producer' | 'consumer';
  iat: number;
  exp: number;
};

export function signSfuJoinToken(payload: SfuJoinPayload, secret: string): string {
  const header = base64UrlEncodeJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlEncodeJson(payload);
  const sig = base64UrlEncodeBytes(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}
