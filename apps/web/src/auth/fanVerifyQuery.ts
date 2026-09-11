import { normalizeFanReturnTo, readReturnToFromQuery } from './fanAuthNavigation'

const CODE_PARAMS = ['confirmation_code', 'code', 'confirmationCode'] as const
const EMAIL_PARAMS = ['username', 'user_name', 'email'] as const
const STRIP_PARAMS = [...CODE_PARAMS, ...EMAIL_PARAMS, 'client_id'] as const

export interface FanVerifyQueryPrefill {
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

/** Read verify deep-link params from the query string (does not mutate the URL). */
export function readFanVerifyQueryPrefill(search: string): FanVerifyQueryPrefill {
  const returnToRaw = readReturnToFromQuery(search)
  const params = new URLSearchParams(search)
  return {
    code: readFirstParam(params, CODE_PARAMS),
    email: readFirstParam(params, EMAIL_PARAMS),
    returnTo: normalizeFanReturnTo(returnToRaw),
  }
}

/** Build a sanitized query string containing only returnTo when it is not the default. */
export function buildStrippedVerifySearch(returnTo: string): string {
  const normalized = normalizeFanReturnTo(returnTo)
  if (normalized === '/catalog') return ''
  return `?returnTo=${encodeURIComponent(normalized)}`
}

export function verifyQueryHasSecrets(search: string): boolean {
  const params = new URLSearchParams(search)
  return STRIP_PARAMS.some((key) => params.has(key))
}

const VERIFY_EMAIL_PATH = '/auth/verify-email'

let bootstrapCodePrefill: string | null = null
let bootstrapEmailPrefill: string | null = null

/** Strip verify secrets from the URL before React mounts; stash prefill in memory only. */
export function bootstrapFanVerifyQueryStrip(): void {
  const { pathname, search } = window.location
  if (pathname !== VERIFY_EMAIL_PATH || !verifyQueryHasSecrets(search)) {
    return
  }
  const prefill = stripFanVerifyQueryFromUrl(pathname, search, '')
  bootstrapCodePrefill = prefill.code
  bootstrapEmailPrefill = prefill.email
}

/** Read bootstrap prefill once; never persisted to storage. */
export function consumeFanVerifyBootstrapPrefill(): { code: string | null; email: string | null } {
  const prefill = { code: bootstrapCodePrefill, email: bootstrapEmailPrefill }
  bootstrapCodePrefill = null
  bootstrapEmailPrefill = null
  return prefill
}

/** Strip verify secrets from the visible URL via replaceState; returns prefilled values. */
export function stripFanVerifyQueryFromUrl(
  pathname: string,
  search: string,
  hash: string,
): FanVerifyQueryPrefill {
  const prefill = readFanVerifyQueryPrefill(search)
  if (!verifyQueryHasSecrets(search)) return prefill

  const strippedSearch = buildStrippedVerifySearch(prefill.returnTo)
  const nextUrl = `${pathname}${strippedSearch}${hash}`
  window.history.replaceState(window.history.state, '', nextUrl)
  return prefill
}
