import { normalizeFanReturnTo, readReturnToFromQuery } from './fanAuthNavigation'

const CODE_PARAMS = ['confirmation_code', 'code', 'confirmationCode'] as const
const EMAIL_PARAMS = ['username', 'user_name', 'email'] as const
const STRIP_PARAMS = [...CODE_PARAMS, ...EMAIL_PARAMS, 'client_id'] as const

export interface FanResetQueryPrefill {
  code: string | null
  email: string | null
  returnTo: string
}

function readFirstParam(params: URLSearchParams, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = params.get(key)?.trim()
    if (value) return value
  }
  return null
}

/** Read reset deep-link params from the query string (does not mutate the URL). */
export function readFanResetQueryPrefill(search: string): FanResetQueryPrefill {
  const params = new URLSearchParams(search)
  const returnToRaw = readReturnToFromQuery(search)
  return {
    code: readFirstParam(params, CODE_PARAMS),
    email: readFirstParam(params, EMAIL_PARAMS),
    returnTo: normalizeFanReturnTo(returnToRaw),
  }
}

/** Build a sanitized query string containing only returnTo when it is not the default. */
export function buildStrippedResetSearch(returnTo: string): string {
  const normalized = normalizeFanReturnTo(returnTo)
  if (normalized === '/catalog') return ''
  return `?returnTo=${encodeURIComponent(normalized)}`
}

export function resetQueryHasSecrets(search: string): boolean {
  const params = new URLSearchParams(search)
  return STRIP_PARAMS.some((key) => params.has(key))
}

const RESET_PASSWORD_PATH = '/auth/reset-password'

function splitPagePath(pagePath: string): { pathname: string; search: string; hash: string } {
  const hashIndex = pagePath.indexOf('#')
  const hash = hashIndex >= 0 ? pagePath.slice(hashIndex) : ''
  const pathAndSearch = hashIndex >= 0 ? pagePath.slice(0, hashIndex) : pagePath
  const queryIndex = pathAndSearch.indexOf('?')
  if (queryIndex < 0) {
    return { pathname: pathAndSearch, search: '', hash }
  }
  return {
    pathname: pathAndSearch.slice(0, queryIndex),
    search: pathAndSearch.slice(queryIndex),
    hash,
  }
}

/** Remove reset secrets from analytics page paths (SR-002). */
export function sanitizeGaPagePath(pagePath: string): string {
  const { pathname, search, hash } = splitPagePath(pagePath)
  if (pathname !== RESET_PASSWORD_PATH || !resetQueryHasSecrets(search)) {
    return pagePath
  }
  const prefill = readFanResetQueryPrefill(search)
  return `${pathname}${buildStrippedResetSearch(prefill.returnTo)}${hash}`
}

let bootstrapCodePrefill: string | null = null
let bootstrapEmailPrefill: string | null = null

/** Strip reset secrets from the URL before React mounts; stash prefill in memory only. */
export function bootstrapFanResetQueryStrip(): void {
  const { pathname, search, hash } = window.location
  if (pathname !== RESET_PASSWORD_PATH || !resetQueryHasSecrets(search)) {
    return
  }
  const prefill = stripFanResetQueryFromUrl(pathname, search, hash)
  bootstrapCodePrefill = prefill.code
  bootstrapEmailPrefill = prefill.email
}

/** Read bootstrap prefill once; never persisted to storage. */
export function consumeFanResetBootstrapPrefill(): { code: string | null; email: string | null } {
  const prefill = { code: bootstrapCodePrefill, email: bootstrapEmailPrefill }
  bootstrapCodePrefill = null
  bootstrapEmailPrefill = null
  return prefill
}

/** Strip reset secrets from the visible URL via replaceState; returns prefilled values. */
export function stripFanResetQueryFromUrl(
  pathname: string,
  search: string,
  hash: string,
): FanResetQueryPrefill {
  const prefill = readFanResetQueryPrefill(search)
  if (!resetQueryHasSecrets(search)) return prefill

  const strippedSearch = buildStrippedResetSearch(prefill.returnTo)
  const nextUrl = `${pathname}${strippedSearch}${hash}`
  window.history.replaceState(window.history.state, '', nextUrl)
  return prefill
}
