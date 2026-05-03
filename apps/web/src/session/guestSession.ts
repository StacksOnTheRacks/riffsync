const STORAGE_SESSION = 'riffsync.sessionId'
const STORAGE_DISPLAY = 'riffsync.displayName'

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

/** Mint session + display name only when entering lobby or room — not catalog browse. */
export function ensureGuestSession(reason: 'lobby' | 'room'): { sessionId: string; displayName: string } {
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

export function headersWithSession(reason: 'lobby' | 'room' = 'lobby'): Record<string, string> {
  const { sessionId } = ensureGuestSession(reason)
  return { 'X-Session-Id': sessionId }
}
