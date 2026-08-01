const STORAGE_SESSION = 'riffsync.sessionId'
const STORAGE_DISPLAY = 'riffsync.displayName'

/** Matches WebSocket `$connect` / fan-profile Patch trim (`infra/cdk/lambda/ws-connect.ts`). */
export const FAN_DISPLAY_NAME_MAX_LEN = 48

const adjectives = ['Quick', 'Quiet', 'Brave', 'Bright', 'Calm', 'Cosmic', 'Clever', 'Daring']
const nouns = ['MSTie', 'Crow', 'Tom', 'Joel', 'Gizmo', 'Riff', 'Party', 'Phantom']

function randomName(): string {
  const a = adjectives[Math.floor(Math.random() * adjectives.length)]
  const n = nouns[Math.floor(Math.random() * nouns.length)]
  const x = Math.floor(Math.random() * 900 + 100)
  return `${a}${n}${x}`
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Mint session + display name only when entering lobby, room, or live — not catalog browse. */
export function ensureGuestSession(
  reason: 'lobby' | 'room' | 'live',
): { sessionId: string; displayName: string } {
  void reason
  let sessionId = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_SESSION) : null
  let displayName = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_DISPLAY) : null
  if (!sessionId) {
    sessionId = newSessionId()
    localStorage.setItem(STORAGE_SESSION, sessionId)
  }
  if (!displayName?.trim()) {
    displayName = randomName()
    localStorage.setItem(STORAGE_DISPLAY, displayName)
  }
  return { sessionId, displayName: displayName.trim() }
}

/** Persist guest/display label locally (also used as cache for signed-in profile mirror). */
export function setGuestDisplayName(name: string): string {
  const trimmed = name.trim().slice(0, FAN_DISPLAY_NAME_MAX_LEN)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_DISPLAY, trimmed)
  }
  return trimmed
}

export function headersWithSession(reason: 'lobby' | 'room' | 'live' = 'lobby'): Record<string, string> {
  const { sessionId } = ensureGuestSession(reason)
  return { 'X-Session-Id': sessionId }
}
