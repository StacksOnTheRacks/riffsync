import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

export type PrivacyRemovalSubmitPayload = {
  contactEmail: string
  message: string
  /** Honeypot — must be empty */
  website: string
}

export async function submitPrivacyRemovalRequest(
  payload: PrivacyRemovalSubmitPayload,
): Promise<{ ok: true } | { error: string }> {
  const base = getPublicApiBaseUrl()
  if (!base) {
    return { error: 'This form is not available in this environment (API URL missing).' }
  }

  const res = await fetch(`${base}/v1/privacy-removal-request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { error: 'Unexpected response from server.' }
  }

  const errMsg =
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'string'
      ? (data as { error: string }).error
      : 'Request failed.'

  if (!res.ok) {
    return { error: errMsg }
  }

  return { ok: true }
}
