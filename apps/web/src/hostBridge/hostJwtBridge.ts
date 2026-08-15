import { refreshFanTokensIfStale } from '../auth/fanHostedUiPkce'
import { getFanAccessToken, getFanRefreshToken } from '../auth/fanTokens'

export const HOST_BRIDGE_CHANNEL = 'riffsync-host-bridge'
export const HOST_BRIDGE_VERSION = 1

export const ALLOWED_HOST_BRIDGE_ORIGINS = ['https://riffsync.tv', 'http://localhost:5173'] as const

export type HostBridgeError = 'not_signed_in' | 'refresh_failed' | 'forbidden_origin' | 'unsupported'

export type HostBridgeMessageType =
  | 'HOST_JWT_REQUEST'
  | 'HOST_JWT_RESPONSE'
  | 'HOST_BRIDGE_PING'
  | 'HOST_BRIDGE_PONG'

export interface HostBridgeEnvelope {
  channel: typeof HOST_BRIDGE_CHANNEL
  v: typeof HOST_BRIDGE_VERSION
  type: HostBridgeMessageType
  requestId: string
  ok?: boolean
  accessToken?: string
  error?: HostBridgeError
}

export function isAllowedHostBridgeOrigin(origin: string): boolean {
  return (ALLOWED_HOST_BRIDGE_ORIGINS as readonly string[]).includes(origin)
}

function isHostBridgeEnvelope(value: unknown): value is HostBridgeEnvelope {
  if (!value || typeof value !== 'object') return false
  const msg = value as Partial<HostBridgeEnvelope>
  return (
    msg.channel === HOST_BRIDGE_CHANNEL &&
    msg.v === HOST_BRIDGE_VERSION &&
    typeof msg.requestId === 'string' &&
    msg.requestId.length > 0 &&
    (msg.type === 'HOST_JWT_REQUEST' ||
      msg.type === 'HOST_JWT_RESPONSE' ||
      msg.type === 'HOST_BRIDGE_PING' ||
      msg.type === 'HOST_BRIDGE_PONG')
  )
}

export interface HostJwtBridgeDeps {
  refreshFanTokensIfStale: () => Promise<void>
  getFanAccessToken: () => string | null
  getFanRefreshToken: () => string | null
  postMessage: (message: HostBridgeEnvelope, targetOrigin: string) => void
  pageWindow?: Window
}

const defaultDeps: HostJwtBridgeDeps = {
  refreshFanTokensIfStale,
  getFanAccessToken,
  getFanRefreshToken,
  postMessage: (message, targetOrigin) => {
    window.postMessage(message, targetOrigin)
  },
}

function respond(
  deps: HostJwtBridgeDeps,
  origin: string,
  requestId: string,
  type: 'HOST_JWT_RESPONSE' | 'HOST_BRIDGE_PONG',
  payload: Pick<HostBridgeEnvelope, 'ok' | 'accessToken' | 'error'>,
): void {
  deps.postMessage(
    {
      channel: HOST_BRIDGE_CHANNEL,
      v: HOST_BRIDGE_VERSION,
      type,
      requestId,
      ...payload,
    },
    origin,
  )
}

export async function handleHostBridgeMessage(
  event: MessageEvent,
  deps: HostJwtBridgeDeps = defaultDeps,
): Promise<void> {
  const pageWindow = deps.pageWindow ?? (typeof window === 'undefined' ? undefined : window)
  if (!pageWindow || event.source !== pageWindow) return
  if (!isAllowedHostBridgeOrigin(event.origin)) return
  if (!isHostBridgeEnvelope(event.data)) return

  if (event.data.type === 'HOST_BRIDGE_PING') {
    respond(deps, event.origin, event.data.requestId, 'HOST_BRIDGE_PONG', { ok: true })
    return
  }

  if (event.data.type !== 'HOST_JWT_REQUEST') return

  const hadRefresh = Boolean(deps.getFanRefreshToken())
  const hadAccess = Boolean(deps.getFanAccessToken())

  try {
    await deps.refreshFanTokensIfStale()
  } catch {
    respond(deps, event.origin, event.data.requestId, 'HOST_JWT_RESPONSE', {
      ok: false,
      error: hadRefresh || hadAccess ? 'refresh_failed' : 'not_signed_in',
    })
    return
  }

  const accessToken = deps.getFanAccessToken()
  if (accessToken) {
    respond(deps, event.origin, event.data.requestId, 'HOST_JWT_RESPONSE', {
      ok: true,
      accessToken,
    })
    return
  }

  respond(deps, event.origin, event.data.requestId, 'HOST_JWT_RESPONSE', {
    ok: false,
    error: hadRefresh || hadAccess ? 'refresh_failed' : 'not_signed_in',
  })
}

export function mountHostJwtBridge(): () => void {
  const onMessage = (event: MessageEvent) => {
    void handleHostBridgeMessage(event)
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
