import { describe, expect, it } from 'vitest';
import { verifySfuJoinToken } from '../../../services/riffsync-sfu/src/jwt';
import { signSfuJoinToken } from './sfu-join-token-sign';

describe('signSfuJoinToken', () => {
  it('round-trips with SFU verifier', () => {
    const secret = 'test-hmac-secret-at-least-32-chars-long';
    const now = Math.floor(Date.now() / 1000);
    const token = signSfuJoinToken(
      {
        env: 'prod',
        roomId: 'room-1',
        sessionId: 'sess-1',
        role: 'consumer',
        iat: now,
        exp: now + 60,
      },
      secret,
    );
    const claims = verifySfuJoinToken(token, secret);
    expect(claims).not.toBeNull();
    expect(claims?.roomId).toBe('room-1');
    expect(claims?.role).toBe('consumer');
  });
});
