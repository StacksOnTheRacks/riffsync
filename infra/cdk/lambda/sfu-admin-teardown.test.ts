import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  smSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mocks.smSend })),
  GetSecretValueCommand: vi.fn((input: unknown) => ({ input, kind: 'GetSecretValue' })),
}));

import {
  __resetSfuAdminSecretCacheForTests,
  requestSfuProducerTeardown,
  sfuAdminBaseUrlFromSignalingWsUrl,
  SFU_ADMIN_SECRET_HEADER,
} from './sfu-admin-teardown';

describe('sfuAdminBaseUrlFromSignalingWsUrl', () => {
  it('maps wss to https', () => {
    expect(sfuAdminBaseUrlFromSignalingWsUrl('wss://signal.example/ws')).toBe(
      'https://signal.example/ws',
    );
  });

  it('maps ws to http', () => {
    expect(sfuAdminBaseUrlFromSignalingWsUrl('ws://10.0.0.1:3000')).toBe('http://10.0.0.1:3000');
  });
});

describe('requestSfuProducerTeardown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSfuAdminSecretCacheForTests();
    process.env.SFU_ADMIN_BASE_URL = 'https://signal.example';
    process.env.SFU_ADMIN_SECRET_ID = 'riffsync/sfu-admin-secret';
    mocks.smSend.mockResolvedValue({ SecretString: 'admin-secret-value' });
  });

  it('posts teardown with admin secret header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ closedCount: 2 }),
    });

    const result = await requestSfuProducerTeardown(
      { env: 'prod', roomId: 'room-1', producerClass: 'participant_av' },
      fetchImpl,
    );

    expect(result).toEqual({ ok: true, closedCount: 2 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://signal.example/admin/teardown-producers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          [SFU_ADMIN_SECRET_HEADER]: 'admin-secret-value',
        }),
        body: JSON.stringify({
          env: 'prod',
          roomId: 'room-1',
          producerClass: 'participant_av',
        }),
      }),
    );
  });

  it('returns misconfigured when base URL is missing', async () => {
    delete process.env.SFU_ADMIN_BASE_URL;
    const result = await requestSfuProducerTeardown(
      { env: 'prod', roomId: 'room-1' },
      vi.fn(),
    );
    expect(result).toEqual({
      ok: false,
      reason: 'misconfigured',
      detail: 'Missing SFU_ADMIN_BASE_URL',
    });
  });

  it('returns sfu_rejected on non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });

    const result = await requestSfuProducerTeardown(
      { env: 'prod', roomId: 'room-1' },
      fetchImpl,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('sfu_rejected');
      expect(result.detail).toContain('401');
    }
  });
});
