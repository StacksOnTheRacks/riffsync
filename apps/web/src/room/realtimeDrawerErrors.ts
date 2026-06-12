import type { SfuMediaErrorCode } from './sfu/mediasoupSharing'
import type { SfuRelayConfigErrorCode } from './sfu/sfuConfigErrors'

/** Normative drawer keys (`execution_model.md`, `api_contracts.md`). */
export const REALTIME_DRAWERS = [
  'chat',
  'sfuSignaling',
  'theaterPlayback',
  'connectivity',
] as const

export type RealtimeDrawer = (typeof REALTIME_DRAWERS)[number]

/**
 * Canonical drawer error codes from `.ai/business_logic/error_state.md` boundary table
 * and `.ai/runtime/execution_model.md` typed runtime errors.
 */
export const REALTIME_DRAWER_ERROR_CODES = [
  'CHAT_SEND_DROPPED',
  'CHAT_RECONNECTING',
  'SIGNALING_TIMEOUT',
  'sfu_signaling_failed',
  'ICE_FAILED',
  'TURN_RELAY_REQUIRED',
  'PRODUCER_CLOSED',
  'sfu_publish_rejected',
  'PLAYBACK_AUDIO_BLOCKED',
  'THEATER_AUDIO_SUSPENDED',
  'SFU_RELAY_URL_MISSING',
  'LOCAL_SFU_UNREACHABLE',
  'SFU_RELAY_UNREACHABLE',
  'SFU_TOKEN_DENIED',
  'TRANSPORT_LIMIT_REACHED',
  'CONSUMER_LIMIT_REACHED',
] as const

export type RealtimeDrawerErrorCode = (typeof REALTIME_DRAWER_ERROR_CODES)[number]

export type RealtimeDrawerError = {
  code: RealtimeDrawerErrorCode
  drawer: RealtimeDrawer
  cause?: unknown
}

/** SFU signaling connect / per-RPC request-ack deadline (`api_contracts.md` #141). */
export const SIGNALING_TIMEOUT_MS = 15_000

/** ICE `disconnected` grace before surfacing `ICE_FAILED` (`api_contracts.md` #141). */
export const ICE_DISCONNECTED_FAILURE_MS = 10_000

const INACTIVE_ACTIVE_ERROR_CODES = new Set<RealtimeDrawerErrorCode>([
  'PRODUCER_CLOSED',
  'CHAT_RECONNECTING',
])

const ERROR_CODE_DRAWER: Record<RealtimeDrawerErrorCode, RealtimeDrawer> = {
  CHAT_SEND_DROPPED: 'chat',
  CHAT_RECONNECTING: 'chat',
  SIGNALING_TIMEOUT: 'sfuSignaling',
  sfu_signaling_failed: 'sfuSignaling',
  ICE_FAILED: 'connectivity',
  TURN_RELAY_REQUIRED: 'connectivity',
  PRODUCER_CLOSED: 'sfuSignaling',
  sfu_publish_rejected: 'sfuSignaling',
  PLAYBACK_AUDIO_BLOCKED: 'theaterPlayback',
  THEATER_AUDIO_SUSPENDED: 'theaterPlayback',
  SFU_RELAY_URL_MISSING: 'sfuSignaling',
  LOCAL_SFU_UNREACHABLE: 'sfuSignaling',
  SFU_RELAY_UNREACHABLE: 'sfuSignaling',
  SFU_TOKEN_DENIED: 'sfuSignaling',
  TRANSPORT_LIMIT_REACHED: 'sfuSignaling',
  CONSUMER_LIMIT_REACHED: 'sfuSignaling',
}

export function drawerForErrorCode(code: RealtimeDrawerErrorCode): RealtimeDrawer {
  return ERROR_CODE_DRAWER[code]
}

export function isRealtimeDrawerErrorCode(value: string): value is RealtimeDrawerErrorCode {
  return (REALTIME_DRAWER_ERROR_CODES as readonly string[]).includes(value)
}

export function isActiveErrorCode(code: RealtimeDrawerErrorCode): boolean {
  return !INACTIVE_ACTIVE_ERROR_CODES.has(code)
}

/** Collect user-visible blocking codes for `getDiagnostics().activeErrorCodes`. */
export function collectActiveErrorCodes(codes: Iterable<string | undefined>): string[] {
  const active: string[] = []
  for (const code of codes) {
    if (!code || !isRealtimeDrawerErrorCode(code)) continue
    if (!isActiveErrorCode(code)) continue
    if (!active.includes(code)) active.push(code)
  }
  return active
}

export function chatSendDroppedError(cause?: unknown): RealtimeDrawerError {
  return { code: 'CHAT_SEND_DROPPED', drawer: 'chat', ...(cause !== undefined ? { cause } : {}) }
}

export function theaterAudioSuspendedError(cause?: unknown): RealtimeDrawerError {
  return {
    code: 'THEATER_AUDIO_SUSPENDED',
    drawer: 'theaterPlayback',
    ...(cause !== undefined ? { cause } : {}),
  }
}

export function playbackAudioBlockedError(cause?: unknown): RealtimeDrawerError {
  return {
    code: 'PLAYBACK_AUDIO_BLOCKED',
    drawer: 'theaterPlayback',
    ...(cause !== undefined ? { cause } : {}),
  }
}

export function producerClosedError(cause?: unknown): RealtimeDrawerError {
  return { code: 'PRODUCER_CLOSED', drawer: 'sfuSignaling', ...(cause !== undefined ? { cause } : {}) }
}

export function mapSfuConfigMediaCodeToDrawerError(
  code: SfuRelayConfigErrorCode,
): RealtimeDrawerError {
  switch (code) {
    case 'missing_ws_url':
      return { code: 'SFU_RELAY_URL_MISSING', drawer: 'sfuSignaling' }
    case 'local_sfu_unreachable':
      return { code: 'LOCAL_SFU_UNREACHABLE', drawer: 'sfuSignaling' }
    case 'sfu_relay_unreachable':
      return { code: 'SFU_RELAY_UNREACHABLE', drawer: 'sfuSignaling' }
    default: {
      const _exhaustive: never = code
      return _exhaustive
    }
  }
}

export function mapSfuMediaCodeToDrawerError(code: SfuMediaErrorCode): RealtimeDrawerError {
  if (code === 'missing_ws_url') {
    return mapSfuConfigMediaCodeToDrawerError('missing_ws_url')
  }
  if (code === 'local_sfu_unreachable') {
    return mapSfuConfigMediaCodeToDrawerError('local_sfu_unreachable')
  }
  if (code === 'sfu_relay_unreachable') {
    return mapSfuConfigMediaCodeToDrawerError('sfu_relay_unreachable')
  }
  if (code === 'signaling_failed') {
    return { code: 'SIGNALING_TIMEOUT', drawer: 'sfuSignaling' }
  }
  if (code === 'signaling_closed') {
    return { code: 'sfu_signaling_failed', drawer: 'sfuSignaling' }
  }
  if (code === 'transport_failed' || code === 'transport_stalled') {
    return { code: 'ICE_FAILED', drawer: 'connectivity' }
  }
  if (code === 'consume_failed') {
    return { code: 'CONSUMER_LIMIT_REACHED', drawer: 'sfuSignaling' }
  }
  if (code === 'produce_failed' || code === 'bad_capabilities') {
    return { code: 'sfu_publish_rejected', drawer: 'sfuSignaling' }
  }
  return { code: 'sfu_signaling_failed', drawer: 'sfuSignaling' }
}

export function mapIceConnectionStateToDrawerError(
  state: RTCIceConnectionState,
): RealtimeDrawerError | null {
  if (state === 'failed') {
    return { code: 'ICE_FAILED', drawer: 'connectivity' }
  }
  return null
}

export function mapTurnRelayRequiredFailure(cause?: unknown): RealtimeDrawerError {
  return { code: 'TURN_RELAY_REQUIRED', drawer: 'connectivity', ...(cause !== undefined ? { cause } : {}) }
}

export function mapDomExceptionToDrawerError(error: unknown): RealtimeDrawerError | null {
  if (!(error instanceof DOMException)) return null
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return null
  }
  return null
}

export function mapChatWsCloseToDrawerError(code: number, reason?: string): RealtimeDrawerError | null {
  void code
  void reason
  return null
}

export function mapSfuTokenDeniedError(cause?: unknown): RealtimeDrawerError {
  return { code: 'SFU_TOKEN_DENIED', drawer: 'sfuSignaling', ...(cause !== undefined ? { cause } : {}) }
}
