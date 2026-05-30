import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

export interface StaffSessionPayload {
  sub: string
  email: string | null
  groups: string[]
}

export class StaffSessionUnauthorizedError extends Error {
  constructor(message = 'Sign in again — staff token rejected') {
    super(message)
    this.name = 'StaffSessionUnauthorizedError'
  }
}

export class StaffSessionForbiddenError extends Error {
  constructor(message = 'Staff group required — contact an administrator') {
    super(message)
    this.name = 'StaffSessionForbiddenError'
  }
}

function staffSessionAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }
}

export async function fetchStaffSession(accessToken: string): Promise<StaffSessionPayload> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const res = await fetch(`${base}/v1/admin/session`, {
    headers: staffSessionAuthHeaders(accessToken),
  })
  if (res.status === 401) {
    throw new StaffSessionUnauthorizedError()
  }
  if (res.status === 403) {
    let detail = 'Staff group required — contact an administrator'
    try {
      const parsed = (await res.json()) as { code?: string; error?: string }
      if (parsed.code === 'staff_group_required' || parsed.error === 'Forbidden') {
        detail = 'Staff group required — contact an administrator'
      }
    } catch {
      /* use default copy */
    }
    throw new StaffSessionForbiddenError(detail)
  }
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Staff session read failed (${res.status}): ${t}`)
  }
  return (await res.json()) as StaffSessionPayload
}
