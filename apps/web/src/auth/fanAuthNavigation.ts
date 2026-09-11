const RETURN_TO_KEY = 'riffsync.returnTo'
const DEFAULT_RETURN = '/catalog'

const FAN_AUTH_HANDOFF_PATHS = [
  '/auth/callback',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/change-password',
] as const

function decodePathTricks(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function hasForbiddenScheme(value: string): boolean {
  const lower = value.trim().toLowerCase()
  if (lower.startsWith('//')) return true
  if (lower.startsWith('http:') || lower.startsWith('https:')) return true
  if (lower.startsWith('javascript:')) return true
  if (lower.startsWith('data:')) return true
  if (/^[a-z][a-z\d+\-.]*:/i.test(lower)) return true
  return false
}

function pathOnly(value: string): string {
  return value.split(/[?#]/)[0] ?? value
}

function isFanAuthHandoff(path: string): boolean {
  const base = pathOnly(path)
  for (const handoff of FAN_AUTH_HANDOFF_PATHS) {
    if (base === handoff || base.startsWith(`${handoff}/`)) return true
  }
  return false
}

function isAdminPath(path: string): boolean {
  const base = pathOnly(path)
  return base === '/admin' || base.startsWith('/admin/')
}

export function isFanReturnPathAllowed(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false
  if (path.includes('\\')) return false
  if (isFanAuthHandoff(path)) return false
  if (isAdminPath(path)) return false
  return true
}

/** Same-origin relative fan paths only; otherwise `/catalog`. */
export function normalizeFanReturnTo(path: string | null | undefined): string {
  if (path == null || typeof path !== 'string') return DEFAULT_RETURN

  const trimmed = path.trim()
  if (!trimmed) return DEFAULT_RETURN
  if (hasForbiddenScheme(trimmed)) return DEFAULT_RETURN

  const decoded = decodePathTricks(trimmed)
  if (hasForbiddenScheme(decoded)) return DEFAULT_RETURN
  if (decoded.startsWith('//')) return DEFAULT_RETURN
  if (!decoded.startsWith('/')) return DEFAULT_RETURN
  if (decoded.includes('\\')) return DEFAULT_RETURN

  if (isFanReturnPathAllowed(decoded)) return decoded
  return DEFAULT_RETURN
}

export function persistReturnTo(returnTo: string): string {
  const normalized = normalizeFanReturnTo(returnTo)
  sessionStorage.setItem(RETURN_TO_KEY, normalized)
  return normalized
}

export function buildFanAuthUrl(authPath: string, returnTo?: string): string {
  const normalized = persistReturnTo(returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`)
  const params = new URLSearchParams({ returnTo: normalized })
  return `${authPath}?${params.toString()}`
}

export function navigateToFanAuth(authPath: string, returnTo?: string): void {
  window.location.assign(buildFanAuthUrl(authPath, returnTo))
}

export function popReturnTo(): string {
  const stored = sessionStorage.getItem(RETURN_TO_KEY)
  sessionStorage.removeItem(RETURN_TO_KEY)
  return normalizeFanReturnTo(stored)
}

export function readReturnToFromQuery(search: string): string | null {
  const value = new URLSearchParams(search).get('returnTo')
  return value
}
