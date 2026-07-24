import { getFanAccessToken } from '../auth/fanTokens'

export const FAN_AUTH_REQUIRED_CLIENT = {
  ok: false as const,
  status: 401,
  code: 'fan_auth_required' as const,
  error: 'Fan authentication required',
}

/** Returns a verified fan access token, or null when the caller is signed out or expired. */
export function requireFanAccessToken(): string | null {
  return getFanAccessToken()
}
