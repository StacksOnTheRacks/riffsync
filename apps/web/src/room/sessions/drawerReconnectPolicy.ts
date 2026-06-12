/** Shared drawer reconnect thresholds per `.ai/runtime/execution_model.md`. */

export const CHAT_RECONNECT_BACKOFF_INITIAL_MS = 1000
export const CHAT_RECONNECT_BACKOFF_MULTIPLIER = 2
export const CHAT_RECONNECT_BACKOFF_CAP_MS = 60_000
export const CHAT_DEGRADED_AFTER_FAILED_CYCLES = 3

/** SFU signaling delay math lives in `sfuReconnectPolicy.ts`; only the degraded threshold is shared here. */
export const SFU_DEGRADED_AFTER_FAILED_CYCLES = 5

/** Proactive SFU join JWT re-mint lead time before `exp` while signaling WS is open. */
export const SFU_JWT_REMINT_LEAD_SECONDS = 60

export function nextChatReconnectBackoffMs(currentBackoffMs: number): {
  delayMs: number
  nextBackoffMs: number
} {
  const delayMs = Math.min(currentBackoffMs, CHAT_RECONNECT_BACKOFF_CAP_MS)
  const nextBackoffMs = Math.min(
    currentBackoffMs * CHAT_RECONNECT_BACKOFF_MULTIPLIER,
    CHAT_RECONNECT_BACKOFF_CAP_MS,
  )
  return { delayMs, nextBackoffMs }
}

export function chatLifecycleAfterFailedCycle(failedCycles: number): 'reconnecting' | 'degraded' {
  return failedCycles >= CHAT_DEGRADED_AFTER_FAILED_CYCLES ? 'degraded' : 'reconnecting'
}

export function sfuLifecycleAfterFailedCycle(failedCycles: number): 'reconnecting' | 'degraded' {
  return failedCycles >= SFU_DEGRADED_AFTER_FAILED_CYCLES ? 'degraded' : 'reconnecting'
}
