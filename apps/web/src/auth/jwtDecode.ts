/** Decode JWT payload (no signature verify — UI + client-side checks only). */

export function jwtPayload<T extends Record<string, unknown>>(accessToken: string): T | null {
  const parts = accessToken.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = atob(b64 + pad)
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

export function cognitoSub(accessToken: string): string | undefined {
  const p = jwtPayload<{ sub?: unknown }>(accessToken)
  return typeof p?.sub === 'string' ? p.sub : undefined
}
