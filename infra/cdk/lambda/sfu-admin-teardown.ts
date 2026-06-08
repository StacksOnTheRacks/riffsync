import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({});

let cachedAdminSecret: string | null = null;

export const SFU_ADMIN_SECRET_HEADER = 'x-sfu-admin-secret';

export function sfuAdminBaseUrlFromSignalingWsUrl(wsUrl: string): string {
  const trimmed = wsUrl.trim();
  if (trimmed.startsWith('wss://')) return `https://${trimmed.slice(6)}`;
  if (trimmed.startsWith('ws://')) return `http://${trimmed.slice(5)}`;
  return trimmed;
}

async function adminSecret(): Promise<string | null> {
  if (cachedAdminSecret) return cachedAdminSecret;
  const secretId =
    process.env.SFU_ADMIN_SECRET_ID?.trim() || process.env.SFU_ADMIN_SECRET_ARN?.trim();
  if (!secretId) return null;
  const out = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
  const s = typeof out.SecretString === 'string' ? out.SecretString.trim() : '';
  if (s === '') return null;
  cachedAdminSecret = s;
  return s;
}

export type SfuTeardownRequest = {
  env: string;
  roomId: string;
  producerClass?: 'participant_av';
};

export type SfuTeardownResult =
  | { ok: true; closedCount: number }
  | { ok: false; reason: 'misconfigured' | 'http_error' | 'sfu_rejected'; detail?: string };

/** Test-only reset for in-memory secret cache. */
export function __resetSfuAdminSecretCacheForTests(): void {
  cachedAdminSecret = null;
}

export async function requestSfuProducerTeardown(
  req: SfuTeardownRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SfuTeardownResult> {
  const baseUrl = process.env.SFU_ADMIN_BASE_URL?.trim() ?? '';
  if (!baseUrl) {
    return { ok: false, reason: 'misconfigured', detail: 'Missing SFU_ADMIN_BASE_URL' };
  }

  const secret = await adminSecret();
  if (!secret) {
    return { ok: false, reason: 'misconfigured', detail: 'Missing SFU admin secret' };
  }

  const url = `${baseUrl.replace(/\/$/, '')}/admin/teardown-producers`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SFU_ADMIN_SECRET_HEADER]: secret,
      },
      body: JSON.stringify(req),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'http_error', detail };
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 240);
    return { ok: false, reason: 'sfu_rejected', detail: `${res.status} ${detail}` };
  }

  let body: { closedCount?: unknown };
  try {
    body = (await res.json()) as { closedCount?: unknown };
  } catch {
    return { ok: true, closedCount: 0 };
  }

  const closedCount = typeof body.closedCount === 'number' ? body.closedCount : 0;
  return { ok: true, closedCount };
}
