import { describe, expect, it } from 'vitest';
import {
  allowedProducerClasses,
  isProducerClassAllowed,
  verifySfuJoinToken,
} from '../../../services/riffsync-sfu/src/jwt';
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

describe('verifySfuJoinToken producerClass', () => {
  const secret = 'test-hmac-secret-at-least-32-chars-long';

  it('accepts host_screen producer claims', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSfuJoinToken(
      {
        env: 'prod',
        roomId: 'room-1',
        sessionId: 'sess-host',
        role: 'producer',
        producerClass: 'host_screen',
        iat: now,
        exp: now + 60,
      },
      secret,
    );
    const claims = verifySfuJoinToken(token, secret);
    expect(claims?.producerClass).toBe('host_screen');
    expect(claims?.fanSub).toBeUndefined();
  });

  it('requires fanSub for participant_av producer claims', () => {
    const now = Math.floor(Date.now() / 1000);
    const withoutFanSub = signSfuJoinToken(
      {
        env: 'prod',
        roomId: 'room-1',
        sessionId: 'sess-fan',
        role: 'producer',
        producerClass: 'participant_av',
        iat: now,
        exp: now + 60,
      },
      secret,
    );
    expect(verifySfuJoinToken(withoutFanSub, secret)).toBeNull();

    const withFanSub = signSfuJoinToken(
      {
        env: 'prod',
        roomId: 'room-1',
        sessionId: 'sess-fan',
        role: 'producer',
        producerClass: 'participant_av',
        fanSub: 'fan-sub-1',
        iat: now,
        exp: now + 60,
      },
      secret,
    );
    const claims = verifySfuJoinToken(withFanSub, secret);
    expect(claims?.producerClass).toBe('participant_av');
    expect(claims?.fanSub).toBe('fan-sub-1');
  });

  it('rejects producerClass on consumer tokens', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSfuJoinToken(
      {
        env: 'prod',
        roomId: 'room-1',
        sessionId: 'sess-guest',
        role: 'consumer',
        producerClass: 'participant_av',
        iat: now,
        exp: now + 60,
      },
      secret,
    );
    expect(verifySfuJoinToken(token, secret)).toBeNull();
  });
});

describe('verifySfuJoinToken producerClasses', () => {
  const secret = 'test-hmac-secret-at-least-32-chars-long';

  it('accepts producerClasses with both host_screen and participant_av', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSfuJoinToken(
      {
        env: 'prod',
        roomId: 'room-1',
        sessionId: 'sess-host',
        role: 'producer',
        producerClasses: ['host_screen', 'participant_av'],
        fanSub: 'host-sub',
        iat: now,
        exp: now + 60,
      },
      secret,
    );
    const claims = verifySfuJoinToken(token, secret);
    expect(claims?.producerClasses).toEqual(['host_screen', 'participant_av']);
    expect(isProducerClassAllowed(claims!, 'host_screen')).toBe(true);
    expect(isProducerClassAllowed(claims!, 'participant_av')).toBe(true);
  });

  it('rejects participant_av not in allowed set', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSfuJoinToken(
      {
        env: 'prod',
        roomId: 'room-1',
        sessionId: 'sess-1',
        role: 'producer',
        producerClasses: ['host_screen'],
        iat: now,
        exp: now + 60,
      },
      secret,
    );
    const claims = verifySfuJoinToken(token, secret)!;
    expect(isProducerClassAllowed(claims, 'participant_av')).toBe(false);
  });

  it('maps legacy host tokens without class claims to allow-all produce', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSfuJoinToken(
      {
        env: 'prod',
        roomId: 'room-1',
        sessionId: 'sess-host',
        role: 'producer',
        iat: now,
        exp: now + 60,
      },
      secret,
    );
    const claims = verifySfuJoinToken(token, secret);
    expect(allowedProducerClasses(claims!)).toEqual([]);
    expect(isProducerClassAllowed(claims!, 'host_screen')).toBe(true);
    expect(isProducerClassAllowed(claims!, 'participant_av')).toBe(true);
  });
});
