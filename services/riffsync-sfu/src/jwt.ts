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

export type ProducerClass = 'host_screen' | 'participant_av';

export type SfuJoinClaims = {
  env: string;
  roomId: string;
  sessionId: string;
  role: 'producer' | 'consumer';
  /** Authoritative allowed produce classes when role is producer. */
  producerClasses?: ProducerClass[];
  /** Legacy single-class claim; treated as one-element producerClasses during verify. */
  producerClass?: ProducerClass;
  fanSub?: string;
  iat: number;
  exp: number;
};

function parseProducerClass(value: unknown): ProducerClass | null {
  if (value === 'host_screen' || value === 'participant_av') return value;
  return null;
}

function parseProducerClasses(value: unknown): ProducerClass[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: ProducerClass[] = [];
  for (const entry of value) {
    const parsed = parseProducerClass(entry);
    if (!parsed) return null;
    if (!out.includes(parsed)) out.push(parsed);
  }
  return out.length > 0 ? out : null;
}

/** Normalized allowed classes for produce authorization (legacy + new claims). */
export function allowedProducerClasses(claims: SfuJoinClaims): ProducerClass[] {
  if (claims.producerClasses && claims.producerClasses.length > 0) {
    return claims.producerClasses;
  }
  if (claims.producerClass) {
    return [claims.producerClass];
  }
  return [];
}

export function isProducerClassAllowed(claims: SfuJoinClaims, producerClass: ProducerClass): boolean {
  if (claims.role !== 'producer') return false;
  const allowed = allowedProducerClasses(claims);
  if (allowed.length === 0) {
    // Legacy host_screen tokens omitted producerClass entirely; allow any produce for producers.
    return !claims.producerClass && !claims.producerClasses;
  }
  return allowed.includes(producerClass);
}

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

  let producerClasses: ProducerClass[] | undefined;
  if (o.producerClasses !== undefined && o.producerClasses !== null) {
    if (o.role !== 'producer') return null;
    const parsed = parseProducerClasses(o.producerClasses);
    if (!parsed) return null;
    producerClasses = parsed;
  }

  let producerClass: ProducerClass | undefined;
  if (o.producerClass !== undefined && o.producerClass !== null) {
    if (o.role !== 'producer') return null;
    const parsed = parseProducerClass(o.producerClass);
    if (!parsed) return null;
    producerClass = parsed;
  }

  let fanSub: string | undefined;
  if (o.fanSub !== undefined && o.fanSub !== null) {
    if (typeof o.fanSub !== 'string' || o.fanSub.trim() === '') return null;
    fanSub = o.fanSub.trim();
  }

  if (o.role === 'producer') {
    const effective = producerClasses ?? (producerClass ? [producerClass] : []);
    if (effective.includes('participant_av') && !fanSub) return null;
  } else if (producerClass !== undefined || producerClasses !== undefined || fanSub !== undefined) {
    return null;
  }

  const claims: SfuJoinClaims = {
    env: o.env.trim(),
    roomId: o.roomId.trim(),
    sessionId: o.sessionId.trim(),
    role: o.role,
    iat: o.iat,
    exp: o.exp,
  };
  if (producerClasses) claims.producerClasses = producerClasses;
  if (producerClass) claims.producerClass = producerClass;
  if (fanSub) claims.fanSub = fanSub;
  return claims;
}

export function isProducerClass(value: unknown): value is ProducerClass {
  return value === 'host_screen' || value === 'participant_av';
}
