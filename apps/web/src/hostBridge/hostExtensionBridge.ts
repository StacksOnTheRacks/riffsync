import { ALLOWED_HOST_BRIDGE_ORIGINS, HOST_BRIDGE_CHANNEL, HOST_BRIDGE_VERSION } from './hostJwtBridge'

export type HostExtensionMessageType =
  | 'HOST_EXTENSION_PING'
  | 'HOST_EXTENSION_PONG'
  | 'HOST_MEDIA_TAB_GET_STATE'
  | 'HOST_MEDIA_TAB_OPEN'
  | 'HOST_MEDIA_TAB_STATE'
  | 'HOST_MEDIA_PLAYBACK'
  | 'HOST_MEDIA_PLAYBACK_RESULT'

export type HostMediaTabState = {
  ok?: boolean
  bound: boolean
  roomId: string | null
  origin: string | null
  mediaTabOpen: boolean
  mediaTabId: number | null
  mediaTabUrl: string | null
  mediaPlaybackControllable: boolean
  reason?: string
}

export type HostMediaPlaybackResult = HostMediaTabState & {
  ok: boolean
  reason?: string
}

type HostExtensionEnvelope = {
  channel: typeof HOST_BRIDGE_CHANNEL
  v: typeof HOST_BRIDGE_VERSION
  type: HostExtensionMessageType
  requestId: string
  url?: string
  action?: 'play' | 'pause'
  ok?: boolean
  bound?: boolean
  roomId?: string | null
  origin?: string | null
  mediaTabOpen?: boolean
  mediaTabId?: number | null
  mediaTabUrl?: string | null
  mediaPlaybackControllable?: boolean
  reason?: string
}

const DEFAULT_TIMEOUT_MS = 2500

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ext-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function isAllowedOrigin(origin: string): boolean {
  return (ALLOWED_HOST_BRIDGE_ORIGINS as readonly string[]).includes(origin)
}

function isExtensionEnvelope(value: unknown): value is HostExtensionEnvelope {
  if (!value || typeof value !== 'object') return false
  const msg = value as Partial<HostExtensionEnvelope>
  return (
    msg.channel === HOST_BRIDGE_CHANNEL &&
    msg.v === HOST_BRIDGE_VERSION &&
    typeof msg.requestId === 'string' &&
    msg.requestId.length > 0 &&
    typeof msg.type === 'string'
  )
}

function postToPage(message: HostExtensionEnvelope): void {
  window.postMessage(message, window.location.origin)
}

function requestFromExtension<T>(
  type: HostExtensionMessageType,
  expectType: HostExtensionMessageType,
  extra: Partial<HostExtensionEnvelope> = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!isAllowedOrigin(window.location.origin)) return Promise.resolve(null)

  const requestId = newRequestId()

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: T | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      resolve(value)
    }

    const onMessage = (event: MessageEvent) => {
      if (event.source != null && event.source !== window) return
      if (!isAllowedOrigin(event.origin)) return
      if (!isExtensionEnvelope(event.data)) return
      if (event.data.requestId !== requestId) return
      if (event.data.type !== expectType) return
      finish(event.data as T)
    }

    window.addEventListener('message', onMessage)
    postToPage({
      channel: HOST_BRIDGE_CHANNEL,
      v: HOST_BRIDGE_VERSION,
      type,
      requestId,
      ...extra,
    })
    const timer = window.setTimeout(() => finish(null), timeoutMs)
  })
}

export async function pingHostExtension(timeoutMs = 800): Promise<boolean> {
  const response = await requestFromExtension<HostExtensionEnvelope>(
    'HOST_EXTENSION_PING',
    'HOST_EXTENSION_PONG',
    {},
    timeoutMs,
  )
  return Boolean(response?.ok)
}

function toMediaTabState(response: HostExtensionEnvelope | null): HostMediaTabState | null {
  if (!response) return null
  return {
    ok: response.ok,
    bound: Boolean(response.bound),
    roomId: response.roomId ?? null,
    origin: response.origin ?? null,
    mediaTabOpen: Boolean(response.mediaTabOpen),
    mediaTabId: typeof response.mediaTabId === 'number' ? response.mediaTabId : null,
    mediaTabUrl: response.mediaTabUrl ?? null,
    mediaPlaybackControllable: Boolean(response.mediaPlaybackControllable),
    reason: response.reason,
  }
}

export async function getHostMediaTabState(): Promise<HostMediaTabState | null> {
  const response = await requestFromExtension<HostExtensionEnvelope>(
    'HOST_MEDIA_TAB_GET_STATE',
    'HOST_MEDIA_TAB_STATE',
  )
  return toMediaTabState(response)
}

export async function openHostMediaTab(url: string): Promise<HostMediaTabState | null> {
  const response = await requestFromExtension<HostExtensionEnvelope>(
    'HOST_MEDIA_TAB_OPEN',
    'HOST_MEDIA_TAB_STATE',
    { url },
  )
  return toMediaTabState(response)
}

export async function sendHostMediaPlayback(
  action: 'play' | 'pause',
): Promise<HostMediaPlaybackResult | null> {
  const response = await requestFromExtension<HostExtensionEnvelope>(
    'HOST_MEDIA_PLAYBACK',
    'HOST_MEDIA_PLAYBACK_RESULT',
    { action },
  )
  if (!response) return null
  const state = toMediaTabState(response)
  if (!state) return null
  return {
    ...state,
    ok: Boolean(response.ok),
    reason: response.reason,
  }
}
