/** Guest `ready` signaling: base delay, capped exponential backoff. */
export const GUEST_READY_BASE_MS = 2500
export const GUEST_READY_MAX_MS = 30_000
export const GUEST_READY_BACKOFF_FACTOR = 1.5

/** Host ICE restart after sustained `connectionState === 'disconnected'`. */
export const HOST_ICERESTART_DEBOUNCE_MS = 2800

/**
 * If we still have `have-local-offer` after this long, assume the guest missed the offer or the
 * answer was lost — close and re-offer on the next `ready` instead of deadlocking.
 */
export const HOST_STALE_HAVE_LOCAL_OFFER_MS = 8000

/**
 * If signaling is `stable` with the guest's answer but `connectionState` stays `connecting`,
 * ICE may be stuck — allow a rebuild after this long.
 */
export const HOST_STALE_CONNECTING_AFTER_ANSWER_MS = 22_000
