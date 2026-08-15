import { ALLOWED_SPA_ORIGINS } from './roomBind.js'
import { isHostBridgeEnvelope } from './hostBridge.js'

export function isAllowedHostBridgeOrigin(origin) {
  return ALLOWED_SPA_ORIGINS.includes(origin)
}

export function shouldForwardPageBridgeMessage(event, requestId, pageWindow = globalThis.window) {
  if (!event || event.source !== pageWindow) return false
  if (!isAllowedHostBridgeOrigin(event.origin)) return false
  if (!isHostBridgeEnvelope(event.data)) return false
  if (event.data.requestId !== requestId) return false
  return event.data.type === 'HOST_JWT_RESPONSE' || event.data.type === 'HOST_BRIDGE_PONG'
}
