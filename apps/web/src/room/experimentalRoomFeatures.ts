const STORAGE_KEY = 'riffsync.experimentalRoomFeatures'

/**
 * Experimental room media (camera/mic, room-mode switcher, participant audio mixing) is opt-in.
 * Tab sharing is the primary feature and must never depend on this being enabled.
 *
 * Enabled when the URL carries `/experimental/true` in the path or `?experimental=true` in the
 * query. The choice is persisted so it survives canonical redirects that drop the path segment;
 * `?experimental=false` (or `/experimental/false`) clears it.
 */
export function detectExperimentalRoomFeatures(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const { pathname, search } = window.location
    const params = new URLSearchParams(search)
    const queryValue = params.get('experimental')
    const pathEnabled = /\/experimental\/true(?:\/|$)/.test(pathname)
    const pathDisabled = /\/experimental\/false(?:\/|$)/.test(pathname)

    if (queryValue === 'true' || pathEnabled) {
      persist(true)
      return true
    }
    if (queryValue === 'false' || pathDisabled) {
      persist(false)
      return false
    }
    return readPersisted()
  } catch {
    return false
  }
}

function persist(enabled: boolean): void {
  try {
    if (enabled) window.localStorage?.setItem(STORAGE_KEY, 'true')
    else window.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    /* storage may be unavailable (private mode quota, etc.) */
  }
}

function readPersisted(): boolean {
  try {
    return window.localStorage?.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}
