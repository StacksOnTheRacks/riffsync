/**
 * Fan DM push WebSocket URL (`wss://…`) from **`RiffSyncApi-prod`** **`FanDmWebSocketUrl`** output.
 * Separate from room **`WebSocketUrl`** / **`VITE_PUBLIC_WS_URL`**.
 */
export function getPublicFanDmWsUrl(): string | undefined {
  const raw = import.meta.env.VITE_PUBLIC_FAN_DM_WS_URL?.trim()
  return raw && raw.length > 0 ? raw.replace(/\/$/, '') : undefined
}

export function getFanDmWsUrlOrThrow(): string {
  const u = getPublicFanDmWsUrl()
  if (!u) {
    throw new Error(
      'Set VITE_PUBLIC_FAN_DM_WS_URL to the deployed Fan DM WebSocket URL (see infra/cdk/README — FanDmWebSocketUrl output).',
    )
  }
  return u
}
