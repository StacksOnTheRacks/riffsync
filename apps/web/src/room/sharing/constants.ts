/** Guest `ready` signaling: base delay, capped exponential backoff. */
export const GUEST_READY_BASE_MS = 2500
export const GUEST_READY_MAX_MS = 30_000
export const GUEST_READY_BACKOFF_FACTOR = 1.5

/** Host ICE restart after sustained `connectionState === 'disconnected'`. */
export const HOST_ICERESTART_DEBOUNCE_MS = 2800
