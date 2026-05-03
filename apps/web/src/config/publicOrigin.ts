/**
 * Canonical browser origin for absolute URLs (share links, OAuth docs, API base hints).
 *
 * - Set `VITE_PUBLIC_ORIGIN` at build time for staging or non-default hosts.
 * - Production builds default to `https://riffsync.tv` (see `.forge/project.json` → `public_domain`).
 * - Local dev falls back to `window.location.origin` (Vite default port 5173).
 */
export function getPublicOrigin(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_ORIGIN
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/$/, '')
  }
  if (import.meta.env.PROD) {
    return 'https://riffsync.tv'
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:5173'
}
