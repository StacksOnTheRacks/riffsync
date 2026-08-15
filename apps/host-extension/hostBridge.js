export const HOST_BRIDGE_CHANNEL = 'riffsync-host-bridge'
export const HOST_BRIDGE_VERSION = 1

export const HOST_BRIDGE_TYPES = new Set([
  'HOST_JWT_REQUEST',
  'HOST_JWT_RESPONSE',
  'HOST_BRIDGE_PING',
  'HOST_BRIDGE_PONG',
  'HOST_MEDIA_PLAY',
  'HOST_MEDIA_PAUSE',
  'HOST_MEDIA_CONTROL_RESPONSE',
])

export const HOST_BRIDGE_ERRORS = new Set([
  'not_signed_in',
  'refresh_failed',
  'forbidden_origin',
  'unsupported',
  'player_unavailable',
  'command_failed',
])

export function isHostBridgeEnvelope(value) {
  if (!value || typeof value !== 'object') return false
  if (value.channel !== HOST_BRIDGE_CHANNEL) return false
  if (value.v !== HOST_BRIDGE_VERSION) return false
  if (!HOST_BRIDGE_TYPES.has(value.type)) return false
  if (typeof value.requestId !== 'string' || value.requestId.length === 0) return false
  return true
}

export function createHostBridgeRequest(type, requestId) {
  return {
    channel: HOST_BRIDGE_CHANNEL,
    v: HOST_BRIDGE_VERSION,
    type,
    requestId,
  }
}
