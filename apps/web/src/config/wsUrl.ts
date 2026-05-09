/**
 * WebSocket API URL (`wss://…`) from **`RiffSyncApi-prod`** **`WebSocketUrl`** output.
 */
export function getPublicWsUrl(): string | undefined {
  const raw = import.meta.env.VITE_PUBLIC_WS_URL?.trim()
  return raw && raw.length > 0 ? raw.replace(/\/$/, '') : undefined
}

export function getWsUrlOrThrow(): string {
  const u = getPublicWsUrl()
  if (!u) {
    throw new Error(
      'Set VITE_PUBLIC_WS_URL to the deployed WebSocket URL (see infra/cdk/README — WebSocketUrl output).',
    )
  }
  return u
}
