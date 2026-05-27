import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

/** Matches Lambda `FAN_AVATAR_MAX_BYTES` in `infra/cdk/lambda/fan-profile-avatar.ts`. */
export const FAN_AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** Multipart field name for `POST /v1/fans/me/avatar` (Lambda `FAN_AVATAR_FORM_FIELD`). */
export const FAN_AVATAR_FORM_FIELD = 'file'

const FAN_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface FanProfilePayload {
  displayName: string | null
  updatedAt: number | null
  avatarUrl: string | null
  avatarUpdatedAt: number | null
}

export type FanAvatarUploadResult = Pick<FanProfilePayload, 'avatarUrl' | 'avatarUpdatedAt'>

export function validateFanAvatarFile(file: File): string | null {
  if (!FAN_AVATAR_MIME_TYPES.has(file.type)) {
    return 'Choose a JPEG, PNG, or WebP image.'
  }
  if (file.size > FAN_AVATAR_MAX_BYTES) {
    return 'Image must be 2 MB or smaller.'
  }
  return null
}

function fanProfileAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }
}

function formatFanProfileHttpError(prefix: string, status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { error?: string; message?: string }
    const detail = parsed.error ?? parsed.message
    if (typeof detail === 'string' && detail.trim() !== '') {
      return `${prefix} (${status}): ${detail}`
    }
  } catch {
    /* use raw body */
  }
  const trimmed = bodyText.trim()
  return trimmed ? `${prefix} (${status}): ${trimmed}` : `${prefix} (${status})`
}

export async function fetchFanProfile(accessToken: string): Promise<FanProfilePayload> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const res = await fetch(`${base}/v1/fans/me`, {
    headers: fanProfileAuthHeaders(accessToken),
  })
  if (res.status === 401) throw new Error('Sign in again — token rejected')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(formatFanProfileHttpError('Fan profile read failed', res.status, t))
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
      ...fanProfileAuthHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ displayName }),
  })
  if (res.status === 401) throw new Error('Sign in again — token rejected')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(formatFanProfileHttpError('Fan profile update failed', res.status, t))
  }
  return (await res.json()) as FanProfilePayload
}

export async function uploadFanProfileAvatar(
  accessToken: string,
  file: File,
): Promise<FanAvatarUploadResult> {
  const validationErr = validateFanAvatarFile(file)
  if (validationErr) {
    throw new Error(validationErr)
  }
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const body = new FormData()
  body.append(FAN_AVATAR_FORM_FIELD, file)
  const res = await fetch(`${base}/v1/fans/me/avatar`, {
    method: 'POST',
    headers: fanProfileAuthHeaders(accessToken),
    body,
  })
  if (res.status === 401) throw new Error('Sign in again — token rejected')
  if (!res.ok) {
    const t = await res.text()
    throw new Error(formatFanProfileHttpError('Avatar upload failed', res.status, t))
  }
  return (await res.json()) as FanAvatarUploadResult
}
