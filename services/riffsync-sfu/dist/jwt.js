import { createHmac, timingSafeEqual } from 'node:crypto';
function base64UrlEncode(buf) {
    return buf
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
function base64UrlToBuffer(s) {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad)
        b64 += '='.repeat(4 - pad);
    return Buffer.from(b64, 'base64');
}
function parseProducerClass(value) {
    if (value === 'host_screen' || value === 'participant_av')
        return value;
    return null;
}
export function verifySfuJoinToken(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3)
        return null;
    const [h, p, s] = parts;
    const expectedSig = createHmac('sha256', secret).update(`${h}.${p}`).digest();
    let got;
    try {
        got = base64UrlToBuffer(s);
    }
    catch {
        return null;
    }
    const expBuf = expectedSig;
    if (got.length !== expBuf.length || !timingSafeEqual(got, expBuf))
        return null;
    let payload;
    try {
        payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
    if (!payload || typeof payload !== 'object')
        return null;
    const o = payload;
    if (typeof o.env !== 'string' || o.env.trim() === '')
        return null;
    if (typeof o.roomId !== 'string' || o.roomId.trim() === '')
        return null;
    if (typeof o.sessionId !== 'string' || o.sessionId.trim() === '')
        return null;
    if (o.role !== 'producer' && o.role !== 'consumer')
        return null;
    if (typeof o.iat !== 'number' || typeof o.exp !== 'number')
        return null;
    const now = Math.floor(Date.now() / 1000);
    if (o.exp < now)
        return null;
    let producerClass;
    if (o.producerClass !== undefined && o.producerClass !== null) {
        if (o.role !== 'producer')
            return null;
        const parsed = parseProducerClass(o.producerClass);
        if (!parsed)
            return null;
        producerClass = parsed;
    }
    let fanSub;
    if (o.fanSub !== undefined && o.fanSub !== null) {
        if (typeof o.fanSub !== 'string' || o.fanSub.trim() === '')
            return null;
        fanSub = o.fanSub.trim();
    }
    if (o.role === 'producer') {
        if (producerClass === 'participant_av' && !fanSub)
            return null;
    }
    else if (producerClass !== undefined || fanSub !== undefined) {
        return null;
    }
    const claims = {
        env: o.env.trim(),
        roomId: o.roomId.trim(),
        sessionId: o.sessionId.trim(),
        role: o.role,
        iat: o.iat,
        exp: o.exp,
    };
    if (producerClass)
        claims.producerClass = producerClass;
    if (fanSub)
        claims.fanSub = fanSub;
    return claims;
}
export function isProducerClass(value) {
    return value === 'host_screen' || value === 'participant_av';
}
