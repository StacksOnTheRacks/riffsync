/**
 * **`wss://`** or **`ws://`** base URL for mediasoup signaling (no query string).
 * Must match API **`sfuPublicWsUrl`** CDK context when using HTTPS SPA (often via TLS terminator).
 */
export function getPublicSfuWsUrl(): string | undefined {
  const raw = import.meta.env.VITE_PUBLIC_SFU_WS_URL?.trim()
  return raw && raw.length > 0 ? raw.replace(/\/$/, '') : undefined
}
