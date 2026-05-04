/** Factual realtime / WebSocket diagnostics — no JWT bodies, no full SDP/candidates. Enable UI with **`?diag=1`** or call **`window.riffsyncRealtimeDiag.print()`**. */

export type RealtimeInboundKind = 'chat' | 'signaling' | 'unknown' | 'parse_error'

type WsTimelineEvent =
  | { t: number; ev: 'connect_attempt'; hostname: string; pathLen: number; queryChars: number; hasAccessTokenQuery: boolean }
  | { t: number; ev: 'open' }
  | { t: number; ev: 'close'; code: number; reason?: string }
  | { t: number; ev: 'error_event' }
  | { t: number; ev: 'outbound_skipped'; action: string; readyState: number }

const WS_TIMELINE_MAX = 40
const INBOUND_SAMPLE_MAX = 25

export type RoomRoleProfile = {
  roomId: string
  sessionProbe8: string
  jwtSubProbe8: string | undefined
  hostSubProbe8: string
  clientClaimsPublisherUi: boolean
  wsConfigured: boolean
  wsHookEnabledSemantics: boolean
}

let roomProfile: RoomRoleProfile | null = null

const timeline: WsTimelineEvent[] = []

const outboundByAction = { ping: 0, chat: 0, signaling: 0, other: 0 }
const outboundDroppedByAction = { ping: 0, chat: 0, signaling: 0, other: 0 }
const inboundCounts: Record<RealtimeInboundKind, number> = {
  chat: 0,
  signaling: 0,
  unknown: 0,
  parse_error: 0,
}
const inboundSamples: { t: number; kind: RealtimeInboundKind; signalingRole?: unknown; signalingKind?: unknown }[] = []

export function realtimeDiagEnabledViaUrl(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('diag') === '1'
  } catch {
    return false
  }
}

export function showRealtimeDiagPanel(): boolean {
  try {
    if (webrtcDebugFlag()) return true
    if (realtimeDiagEnabledViaUrl()) return true
    return localStorage.getItem('riffsync.roomDiagPanel') === '1'
  } catch {
    return false
  }
}

function webrtcDebugFlag(): boolean {
  try {
    if (sessionStorage.getItem('riffsync.webrtcDebug') === '1') return true
    const v = new URLSearchParams(window.location.search).get('webrtcDebug')
    return v === '1' || v === 'true'
  } catch {
    return false
  }
}

function pushTimeline(e: WsTimelineEvent): void {
  timeline.push(e)
  if (timeline.length > WS_TIMELINE_MAX) timeline.splice(0, timeline.length - WS_TIMELINE_MAX)
}

export function setRealtimeRoomProfile(p: RoomRoleProfile | null): void {
  roomProfile = p
}

export function recordWsConnectAttempt(wsUrlRaw: string, hasAccessTokenQuery: boolean): void {
  let hostname = ''
  let pathLen = 0
  let queryChars = 0
  try {
    const u = new URL(wsUrlRaw)
    hostname = u.hostname
    pathLen = u.pathname.length
    queryChars = u.search.length
  } catch {
    hostname = '(unparseable url)'
  }
  pushTimeline({
    t: Date.now(),
    ev: 'connect_attempt',
    hostname,
    pathLen,
    queryChars,
    hasAccessTokenQuery,
  })
}

export function recordWsOpen(): void {
  pushTimeline({ t: Date.now(), ev: 'open' })
}

export function recordWsClose(code: number, reason?: string): void {
  pushTimeline({ t: Date.now(), ev: 'close', code, reason })
}

export function recordWsErrorEvent(): void {
  pushTimeline({ t: Date.now(), ev: 'error_event' })
}

function classifyOutboundAction(payload: Record<string, unknown>): keyof typeof outboundByAction {
  const a = payload.action
  if (a === 'ping') return 'ping'
  if (a === 'chat') return 'chat'
  if (a === 'signaling') return 'signaling'
  return 'other'
}

export function recordOutboundSent(payload: Record<string, unknown>): void {
  const k = classifyOutboundAction(payload)
  outboundByAction[k]++
}

export function recordOutboundDropped(payload: Record<string, unknown>, readyState: number): void {
  const k = classifyOutboundAction(payload)
  outboundDroppedByAction[k]++
  pushTimeline({
    t: Date.now(),
    ev: 'outbound_skipped',
    action: k,
    readyState,
  })
  console.warn('[riffsync-diag] WebSocket outbound dropped (socket not OPEN)', {
    action: k,
    readyState,
  })
}

export function recordInboundWsMessage(raw: string): void {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw) as Record<string, unknown>
  } catch {
    inboundCounts.parse_error++
    inboundSamples.push({ t: Date.now(), kind: 'parse_error' })
    if (inboundSamples.length > INBOUND_SAMPLE_MAX) inboundSamples.shift()
    return
  }

  const t = data.type
  if (t === 'chat') {
    inboundCounts.chat++
    inboundSamples.push({ t: Date.now(), kind: 'chat' })
  } else if (t === 'signaling') {
    inboundCounts.signaling++
    const env = data.envelope
    const signalingKind =
      env && typeof env === 'object' && env !== null && 'kind' in env ? (env as { kind?: unknown }).kind : undefined
    inboundSamples.push({
      t: Date.now(),
      kind: 'signaling',
      signalingRole: data.role,
      signalingKind,
    })
  } else {
    inboundCounts.unknown++
    inboundSamples.push({ t: Date.now(), kind: 'unknown' })
  }
  if (inboundSamples.length > INBOUND_SAMPLE_MAX) inboundSamples.shift()
}

export function getRealtimeDiagSnapshot(): Record<string, unknown> {
  const lastClose = [...timeline].reverse().find((e) => e.ev === 'close') as Extract<
    WsTimelineEvent,
    { ev: 'close' }
  > | undefined
  return {
    generatedAtIso: new Date().toISOString(),
    room: roomProfile,
    wsTimelineRecent: [...timeline],
    lastWsCloseCode: lastClose?.code,
    outboundSent: { ...outboundByAction },
    outboundDropped: { ...outboundDroppedByAction },
    inboundCounts: { ...inboundCounts },
    inboundSamplesRecent: [...inboundSamples],
    hints: diagHints(roomProfile, lastClose?.code, outboundDroppedByAction),
  }
}

function diagHints(
  room: RoomRoleProfile | null,
  lastCloseCode: number | undefined,
  dropped: typeof outboundDroppedByAction,
): string[] {
  const hints: string[] = []
  if (!room?.wsConfigured) hints.push('VITE_PUBLIC_WS_URL is unset — realtime cannot start.')
  if (room?.wsConfigured && !room.wsHookEnabledSemantics && room.roomId) hints.push('WebSocket hook disabled until room loads (waiting on HTTP GET /v1/rooms/{id}).')
  if (room?.clientClaimsPublisherUi && dropped.signaling > 0) {
    hints.push('Outbound signaling dropped while UI thinks you are host — WS may not have been OPEN yet, or reconnecting.')
  }
  if (room?.clientClaimsPublisherUi && room.jwtSubProbe8 && room.jwtSubProbe8 === room.hostSubProbe8) {
    hints.push(
      'This tab treats you as HOST (JWT sub matches room.hostSub). A second browser signed in as the SAME host cannot be a guest — use Incognito signed-out.',
    )
  }
  if (lastCloseCode === 1006) hints.push('WS closed abnormally (1006) — often failed handshake ($connect rejection, proxy, TLS). Check CloudWatch WsConnectFn logs with this timestamp.')
  if (lastCloseCode === 1002) hints.push('WS protocol error — inspect API Gateway routes / message format.')
  if (lastCloseCode === 1008) hints.push('WS policy violation — often auth / endpoint policy.')
  return hints
}

export function clearRealtimeDiag(): void {
  timeline.length = 0
  for (const k of Object.keys(outboundByAction) as (keyof typeof outboundByAction)[]) {
    outboundByAction[k] = 0
    outboundDroppedByAction[k] = 0
  }
  inboundCounts.chat = 0
  inboundCounts.signaling = 0
  inboundCounts.unknown = 0
  inboundCounts.parse_error = 0
  inboundSamples.length = 0
}

export function installRealtimeDiagGlobal(): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as { riffsyncRealtimeDiag: unknown }).riffsyncRealtimeDiag = {
    snapshot: () => getRealtimeDiagSnapshot(),
    print: () => {
      console.info('[riffsync-diag]', JSON.stringify(getRealtimeDiagSnapshot(), null, 2))
    },
    clear: () => clearRealtimeDiag(),
  }
}
