/**
 * Trim and strip a trailing slash. Require an HTTPS origin (host required).
 * Mirrors SPA `getPublicApiBaseUrl` meaning, plus an HTTPS origin check.
 */
export function getPublicApiBaseUrl(raw) {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  let url
  try {
    url = new URL(trimmed)
  } catch {
    return undefined
  }

  if (url.protocol !== 'https:' || !url.hostname) return undefined

  return trimmed.replace(/\/$/, '')
}
