/** Inbound typing ellipsis TTL — see `.ai/interface/interaction_flow.md`. */
export const TYPING_INDICATOR_TTL_MS = 5_000

export type RemoteTypingEntry = {
  sessionId: string
  displayName: string
  expiresAt: number
}

export type InboundTypingAction = 'start' | 'stop'

export function applyInboundTyping(
  entries: ReadonlyMap<string, RemoteTypingEntry>,
  params: {
    sessionId: string
    displayName: string
    action: InboundTypingAction
  },
  nowMs: number = Date.now(),
): Map<string, RemoteTypingEntry> {
  const next = new Map(entries)
  if (params.action === 'stop') {
    next.delete(params.sessionId)
    return next
  }
  next.set(params.sessionId, {
    sessionId: params.sessionId,
    displayName: params.displayName,
    expiresAt: nowMs + TYPING_INDICATOR_TTL_MS,
  })
  return next
}

export function pruneExpiredTyping(
  entries: ReadonlyMap<string, RemoteTypingEntry>,
  nowMs: number = Date.now(),
): Map<string, RemoteTypingEntry> {
  const next = new Map<string, RemoteTypingEntry>()
  for (const [key, entry] of entries) {
    if (entry.expiresAt > nowMs) {
      next.set(key, entry)
    }
  }
  return next
}

export function listRemoteTyping(
  entries: ReadonlyMap<string, RemoteTypingEntry>,
  ownSessionId: string,
  nowMs: number = Date.now(),
): RemoteTypingEntry[] {
  return [...pruneExpiredTyping(entries, nowMs).values()]
    .filter((entry) => entry.sessionId !== ownSessionId)
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    )
}
