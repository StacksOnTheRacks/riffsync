import { getPublicApiBaseUrl } from '../../config/apiBaseUrl'

export const CAST_DIAG_EVENTS = [
  'sender_start_requested',
  'sender_request_session_resolved',
  'sender_request_session_rejected',
  'sender_launch_timeout',
  'sender_render_confirmed',
  'sender_render_timeout',
  'sender_start_failed',
  'receiver_html_parsed',
  'receiver_html_loaded',
  'receiver_caf_missing',
  'receiver_caf_started',
  'receiver_caf_failed',
  'receiver_app_mounted',
  'receiver_rendered',
] as const

export type CastDiagEvent = (typeof CAST_DIAG_EVENTS)[number]
export type CastDiagHop = 'sender' | 'receiver'

export type CastDiagReport = {
  event: CastDiagEvent
  hop: CastDiagHop
  attemptId?: string
  code?: string | number
  description?: string
  details?: unknown
}

export type CastDiagSanitizedReport = {
  event: CastDiagEvent
  hop: CastDiagHop
  attemptId?: string
  code?: string
  description?: string
  details?: string
}

const ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_PATTERN = /^[A-Za-z0-9_.-]{1,40}$/

let currentAttemptId: string | null = null

function newAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return '00000000-0000-4000-8000-000000000000'
}

export function beginCastAttempt(): string {
  currentAttemptId = newAttemptId()
  return currentAttemptId
}

export function getCastAttemptId(): string | null {
  return currentAttemptId
}

function sanitizeAttemptId(value: string | undefined): string | undefined {
  if (!value || !ATTEMPT_ID_PATTERN.test(value)) return undefined
  return value
}

function sanitizeCode(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value).slice(0, 40)
  }
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return CODE_PATTERN.test(trimmed) ? trimmed : undefined
}

function sanitizeText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!cleaned) return undefined
  return cleaned.slice(0, max)
}

function detailsFromUnknown(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return sanitizeText(value, 120)
  if (typeof value === 'object') {
    const type = (value as { type?: unknown }).type
    if (typeof type === 'string') return sanitizeText(type, 120)
    try {
      return sanitizeText(JSON.stringify(value), 120)
    } catch {
      return undefined
    }
  }
  return sanitizeText(String(value), 120)
}

export function sanitizeCastDiagReport(input: CastDiagReport): CastDiagSanitizedReport {
  return {
    event: input.event,
    hop: input.hop,
    attemptId: sanitizeAttemptId(input.attemptId ?? currentAttemptId ?? undefined),
    code: sanitizeCode(input.code),
    description: sanitizeText(input.description, 80),
    details: detailsFromUnknown(input.details),
  }
}

function postCastDiag(report: CastDiagSanitizedReport): void {
  if (import.meta.env.MODE === 'test') return
  const api = getPublicApiBaseUrl()
  if (!api) return
  const url = `${api}/v1/cast/diag`
  const body = JSON.stringify(report)
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(url, body)
      if (queued) return
    }
  } catch {
    /* fall through to fetch */
  }
  if (typeof fetch !== 'function') return
  void fetch(url, {
    method: 'POST',
    body,
    keepalive: true,
    mode: 'cors',
    headers: { 'content-type': 'text/plain' },
  }).catch(() => undefined)
}

/** Console JSON plus best-effort ingest. Never throws. */
export function reportCastDiag(input: CastDiagReport): void {
  try {
    const report = sanitizeCastDiagReport(input)
    const line = JSON.stringify({ riffsyncCast: true, ...report })
    if (input.event.includes('fail') || input.event.includes('reject') || input.event.includes('timeout')) {
      console.error(`[RiffSync Cast] ${line}`)
    } else {
      console.info(`[RiffSync Cast] ${line}`)
    }
    postCastDiag(report)
  } catch {
    /* Cast diagnosis must never break start or stop. */
  }
}

export function resetCastAttemptForTests(): void {
  currentAttemptId = null
}
