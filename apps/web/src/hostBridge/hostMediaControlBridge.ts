import {
  ALLOWED_HOST_BRIDGE_ORIGINS,
  HOST_BRIDGE_CHANNEL,
  HOST_BRIDGE_VERSION,
} from './hostJwtBridge'

export type HostMediaControlAction = 'play' | 'pause'

export type HostMediaControlMessageType =
  | 'HOST_MEDIA_PLAY'
  | 'HOST_MEDIA_PAUSE'
  | 'HOST_MEDIA_CONTROL_RESPONSE'

export type HostMediaControlError =
  | 'forbidden_origin'
  | 'unsupported'
  | 'player_unavailable'
  | 'command_failed'

export interface HostMediaControlEnvelope {
  channel: typeof HOST_BRIDGE_CHANNEL
  v: typeof HOST_BRIDGE_VERSION
  type: HostMediaControlMessageType
  requestId: string
  ok?: boolean
  error?: HostMediaControlError
}

export type HostMediaPlayerControls = {
  play(): void
  pause(): void
}

function isHostMediaControlEnvelope(value: unknown): value is HostMediaControlEnvelope {
  if (!value || typeof value !== 'object') return false
  const msg = value as Partial<HostMediaControlEnvelope>
  return (
    msg.channel === HOST_BRIDGE_CHANNEL &&
    msg.v === HOST_BRIDGE_VERSION &&
    typeof msg.requestId === 'string' &&
    msg.requestId.length > 0 &&
    (msg.type === 'HOST_MEDIA_PLAY' ||
      msg.type === 'HOST_MEDIA_PAUSE' ||
      msg.type === 'HOST_MEDIA_CONTROL_RESPONSE')
  )
}

export interface HostMediaControlBridgeDeps {
  getControls: () => HostMediaPlayerControls | null
  postMessage: (message: HostMediaControlEnvelope, targetOrigin: string) => void
  pageWindow?: Window
}

const defaultDeps: HostMediaControlBridgeDeps = {
  getControls: () => null,
  postMessage: (message, targetOrigin) => {
    window.postMessage(message, targetOrigin)
  },
}

function respond(
  deps: HostMediaControlBridgeDeps,
  origin: string,
  requestId: string,
  payload: Pick<HostMediaControlEnvelope, 'ok' | 'error'>,
): void {
  deps.postMessage(
    {
      channel: HOST_BRIDGE_CHANNEL,
      v: HOST_BRIDGE_VERSION,
      type: 'HOST_MEDIA_CONTROL_RESPONSE',
      requestId,
      ...payload,
    },
    origin,
  )
}

export function handleHostMediaControlMessage(
  event: MessageEvent,
  deps: HostMediaControlBridgeDeps = defaultDeps,
): void {
  const pageWindow = deps.pageWindow ?? (typeof window === 'undefined' ? undefined : window)
  if (!pageWindow || event.source !== pageWindow) return
  if (!(ALLOWED_HOST_BRIDGE_ORIGINS as readonly string[]).includes(event.origin)) return
  if (!isHostMediaControlEnvelope(event.data)) return
  if (event.data.type !== 'HOST_MEDIA_PLAY' && event.data.type !== 'HOST_MEDIA_PAUSE') return

  const controls = deps.getControls()
  if (!controls) {
    respond(deps, event.origin, event.data.requestId, {
      ok: false,
      error: 'player_unavailable',
    })
    return
  }

  try {
    if (event.data.type === 'HOST_MEDIA_PLAY') controls.play()
    else controls.pause()
    respond(deps, event.origin, event.data.requestId, { ok: true })
  } catch {
    respond(deps, event.origin, event.data.requestId, {
      ok: false,
      error: 'command_failed',
    })
  }
}

export function mountHostMediaControlBridge(
  getControls: () => HostMediaPlayerControls | null,
): () => void {
  const deps: HostMediaControlBridgeDeps = {
    getControls,
    postMessage: (message, targetOrigin) => {
      window.postMessage(message, targetOrigin)
    },
  }
  const onMessage = (event: MessageEvent) => {
    handleHostMediaControlMessage(event, deps)
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
