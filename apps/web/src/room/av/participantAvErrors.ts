import type { SfuMediaErrorCode } from '../sfu/mediasoupSharing'
import type { SfuSessionEndReason } from '../sfu/mediasoupSharing'

/** Stable client codes (`.ai/business_logic/error_state.md`). */
export type ParticipantAvErrorCode =
  | 'permission_denied'
  | 'device_unavailable'
  | 'av_disabled'
  | 'publisher_cap_exceeded'
  | 'rate_limited'
  | 'fan_auth_required'
  | 'sfu_publish_rejected'
  | 'token_expired'
  | 'sfu_signaling_failed'

/** `POST /v1/webrtc/sfu-token` denial `code` values mapped for participant producers. */
export type SfuTokenDenialCode =
  | 'av_disabled'
  | 'fan_auth_required'
  | 'not_host'
  | 'unknown_session'
  | 'publisher_cap_exceeded'
  | 'rate_limited'

const ERROR_COPY: Record<ParticipantAvErrorCode, string> = {
  permission_denied:
    'Camera/microphone permission was blocked. Check browser or system settings, then try again.',
  device_unavailable:
    'No camera or microphone was found, or the device is in use by another app.',
  av_disabled: 'The host turned room A/V off.',
  publisher_cap_exceeded:
    'This room has reached the maximum number of live cameras and microphones. Wait for someone to turn off A/V or ask the host.',
  rate_limited: 'Too many connection attempts. Wait a moment and try again.',
  fan_auth_required: 'Sign in to use camera and microphone in this room.',
  sfu_publish_rejected: 'Could not publish your camera/microphone. Try again in a moment.',
  token_expired: 'Your video relay connection expired. Turn the control off and on again.',
  sfu_signaling_failed:
    'Video relay connection lost. Refresh the page or wait for automatic reconnect.',
}

/** Host AV kill switch copy (same string as `av_disabled`). */
export const PARTICIPANT_AV_DISABLED_COPY = ERROR_COPY.av_disabled

export function participantAvErrorMessage(code: ParticipantAvErrorCode): string {
  return ERROR_COPY[code]
}

const DOM_EXCEPTION_CODES: Record<string, ParticipantAvErrorCode> = {
  NotAllowedError: 'permission_denied',
  PermissionDeniedError: 'permission_denied',
  NotFoundError: 'device_unavailable',
  NotReadableError: 'device_unavailable',
  OverconstrainedError: 'device_unavailable',
  AbortError: 'device_unavailable',
}

export function participantAvErrorFromDomException(error: unknown): ParticipantAvErrorCode {
  if (error instanceof DOMException && error.name in DOM_EXCEPTION_CODES) {
    return DOM_EXCEPTION_CODES[error.name]!
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase()
    if (lower.includes('permission') || lower.includes('notallowed')) {
      return 'permission_denied'
    }
    if (
      lower.includes('notfound') ||
      lower.includes('notreadable') ||
      lower.includes('overconstrained') ||
      lower.includes('no camera or microphone') ||
      lower.includes('could not access camera or microphone')
    ) {
      return 'device_unavailable'
    }
  }
  return 'permission_denied'
}

const TOKEN_DENIAL_TO_AV: Partial<Record<SfuTokenDenialCode, ParticipantAvErrorCode>> = {
  av_disabled: 'av_disabled',
  fan_auth_required: 'fan_auth_required',
  publisher_cap_exceeded: 'publisher_cap_exceeded',
  rate_limited: 'rate_limited',
}

export function participantAvErrorFromSfuTokenDenial(
  status: number,
  code: string | undefined,
): ParticipantAvErrorCode | null {
  if (code && code in TOKEN_DENIAL_TO_AV) {
    return TOKEN_DENIAL_TO_AV[code as SfuTokenDenialCode] ?? null
  }
  if (status === 429) return 'rate_limited'
  return null
}

/** Token denials that should hard-fail participant publish (toggle off, no auto-retry). */
export function isParticipantAvTokenHardFail(code: string | undefined): boolean {
  return (
    code === 'publisher_cap_exceeded' ||
    code === 'av_disabled' ||
    code === 'fan_auth_required' ||
    code === 'rate_limited'
  )
}

export function participantAvErrorFromSfuMediaCode(code: SfuMediaErrorCode): ParticipantAvErrorCode {
  if (
    code === 'local_sfu_unreachable' ||
    code === 'sfu_relay_unreachable' ||
    code === 'missing_ws_url'
  ) {
    return 'sfu_signaling_failed'
  }
  if (code === 'signaling_failed' || code === 'signaling_closed') {
    return 'sfu_signaling_failed'
  }
  return 'sfu_publish_rejected'
}

const SFU_SIGNALING_EXHAUSTED_ATTEMPTS = 5

export function participantAvErrorFromSfuSessionEnd(
  reason: SfuSessionEndReason,
  opts: { hadPublishIntent: boolean; reconnectAttempts: number },
): ParticipantAvErrorCode | null {
  if (!opts.hadPublishIntent) return null
  if (reason === 'user_close') return null
  const lowerReason = String(reason).toLowerCase()
  if (lowerReason.includes('expired') || lowerReason.includes('jwt')) {
    return 'token_expired'
  }
  if (opts.reconnectAttempts >= SFU_SIGNALING_EXHAUSTED_ATTEMPTS) {
    return 'sfu_signaling_failed'
  }
  if (
    reason === 'signaling_close' ||
    reason === 'transport_failed' ||
    reason === 'transport_disconnected_timeout'
  ) {
    return null
  }
  return null
}

export function parseSfuTokenHttpErrorPayload(text: string): {
  code?: string
  error?: string
  detail?: string
} {
  try {
    const j = JSON.parse(text) as { code?: unknown; error?: unknown; detail?: unknown }
    return {
      code: typeof j.code === 'string' ? j.code : undefined,
      error: typeof j.error === 'string' ? j.error : undefined,
      detail: typeof j.detail === 'string' ? j.detail : undefined,
    }
  } catch {
    return {}
  }
}

export class SfuTokenHttpError extends Error {
  readonly status: number
  readonly code?: string
  readonly apiError?: string

  constructor(status: number, body: { code?: string; error?: string; detail?: string }) {
    const apiError =
      body.error && body.detail?.trim()
        ? `${body.error} (${body.detail})`
        : body.error
    super(`sfu-token ${status}: ${apiError ?? 'request failed'}`)
    this.name = 'SfuTokenHttpError'
    this.status = status
    this.code = body.code
    this.apiError = body.error
  }
}
