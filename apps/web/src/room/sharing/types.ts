/**
 * Signaling envelopes for mesh screen share (`action: signaling`, SPA-owned).
 *
 * **`protocolVersion` 1** adds **`shareGeneration`** for dedupe and stale ICE/SDP guarding.
 */

export const SHARE_SIGNAL_PROTOCOL_VERSION = 1

/** When missing or 0 on the wire → legacy client / coerced absent; skips strict dedupe. */
export type ShareEnvelopeBase = Record<string, unknown>

export function readProtocolVersion(envelope: ShareEnvelopeBase): number | undefined {
  const v = envelope.protocolVersion
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Monotonic capture session counter from host. `0` = legacy / unspecified. */
export function readShareGeneration(envelope: ShareEnvelopeBase): number {
  const g = envelope.shareGeneration
  if (typeof g === 'number' && Number.isFinite(g) && g > 0) return g
  return 0
}

export function isProtocolV1(envelope: ShareEnvelopeBase): boolean {
  return readProtocolVersion(envelope) === SHARE_SIGNAL_PROTOCOL_VERSION
}
