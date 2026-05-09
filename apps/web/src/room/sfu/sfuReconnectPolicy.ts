/** SFU signaling reconnect: base delay (ms), doubles each attempt, capped. */
const SFU_BACKOFF_BASE_MS = 600
const SFU_BACKOFF_CAP_MS = 45_000

export function nextSfuReconnectDelayMs(attemptIndexZeroBased: number): number {
  const n = Math.max(0, attemptIndexZeroBased)
  const exp = SFU_BACKOFF_BASE_MS * 2 ** Math.min(n, 12)
  return Math.min(exp, SFU_BACKOFF_CAP_MS)
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
