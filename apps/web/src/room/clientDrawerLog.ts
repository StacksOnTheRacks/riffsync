export type ClientDrawer = 'chat' | 'signaling' | 'connectivity' | 'produce_consume'

export type ClientDrawerOutcome = 'retry' | 'failed' | 'recovered'

export type ClientDrawerLogSeverity = 'info' | 'warn' | 'error'

export type ClientDrawerLogPayload = {
  drawer: ClientDrawer
  event: string
  outcome: ClientDrawerOutcome
  code?: string
  /** Overrides default level selection; never serialized to the log line. */
  severity?: ClientDrawerLogSeverity
}

const FORBIDDEN_LOG_KEYS = new Set([
  'roomId',
  'sessionId',
  'sub',
  'jwt',
  'accessToken',
  'idToken',
  'token',
  'sdp',
  'sdpOffer',
  'sdpAnswer',
  'iceCandidate',
  'candidate',
])

function selectConsoleSink(payload: ClientDrawerLogPayload): typeof console.info {
  if (payload.severity === 'error') return console.error
  if (payload.severity === 'warn') return console.warn
  if (payload.severity === 'info') return console.info
  if (payload.code !== undefined && payload.code !== '') return console.warn
  return console.info
}

function buildSerializedBody(payload: ClientDrawerLogPayload): Record<string, string> {
  const body: Record<string, string> = {
    drawer: payload.drawer,
    event: payload.event,
    outcome: payload.outcome,
  }
  if (payload.code !== undefined && payload.code !== '') {
    body.code = payload.code
  }
  return body
}

/** Production drawer-tagged client diagnostics — one JSON object per console line. */
export function emitClientDrawerLog(payload: ClientDrawerLogPayload & Record<string, unknown>): void {
  const sink = selectConsoleSink(payload)
  sink(JSON.stringify(buildSerializedBody(payload)))
}

export const clientDrawerLogForbiddenKeys = [...FORBIDDEN_LOG_KEYS] as const
