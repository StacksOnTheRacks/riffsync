import { describe, expect, it } from 'vitest';
import { turnRestCredential, turnRestUsername } from './webrtc-turn-credentials';

describe('turnRestCredential', () => {
  it('matches known HMAC-SHA1 base64 vector', () => {
    const secret = 'test';
    const username = turnRestUsername(1234567890, 'user');
    expect(username).toBe('1234567890:user');
    const credential = turnRestCredential(secret, username);
    expect(credential).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // Deterministic: echo -n '1234567890:user' | openssl dgst -sha1 -hmac test -binary | base64
    expect(credential).toBe('SMIla0djXzTMuI2Ie+ip+McbnOs=');
  });
});
