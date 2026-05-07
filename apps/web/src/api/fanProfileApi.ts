import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

export interface FanProfilePayload {
  displayName: string | null
  updatedAt: number | null
}

export async function fetchFanProfile(accessToken: string): Promise<FanProfilePayload> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const res = await fetch(`${base}/v1/fans/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (res.status === 401) throw new Error('Sign in again — token rejected')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Fan profile read failed (${res.status}): ${t}`)
  }
  return (await res.json()) as FanProfilePayload
}

export async function patchFanProfileDisplayName(
  accessToken: string,
  displayName: string,
): Promise<FanProfilePayload> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const res = await fetch(`${base}/v1/fans/me`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ displayName }),
  })
  if (res.status === 401) throw new Error('Sign in again — token rejected')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Fan profile update failed (${res.status}): ${t}`)
  }
  return (await res.json()) as FanProfilePayload
}
