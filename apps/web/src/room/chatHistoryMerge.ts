import type { ReactionChip, ReactionsByMessage } from './chatReactions'
import type { ChatLine } from './roomPageTypes'

export type ChatHistorySnapshot = {
  messages: ChatLine[]
  reactions: ReactionsByMessage
}

export function mergeChatHistory(
  currentChat: readonly ChatLine[],
  currentReactions: ReactionsByMessage,
  snapshot: ChatHistorySnapshot,
): { chat: ChatLine[]; chatReactions: ReactionsByMessage } {
  const byId = new Map(currentChat.map((line) => [line.messageId, line]))
  for (const line of snapshot.messages) {
    byId.set(line.messageId, line)
  }
  const chat = [...byId.values()].sort((a, b) => a.ts - b.ts)

  const chatReactions: ReactionsByMessage = { ...currentReactions }
  for (const [messageId, chips] of Object.entries(snapshot.reactions)) {
    chatReactions[messageId] = { ...chips }
  }

  return { chat, chatReactions }
}

export function parseHistoryReactionChip(raw: unknown): ReactionChip | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const count = typeof o.count === 'number' && Number.isFinite(o.count) ? Math.max(0, Math.floor(o.count)) : null
  if (count === null) return null
  if (typeof o.reactedByMe !== 'boolean') return null
  return { count, reactedByMe: o.reactedByMe }
}

export function parseHistoryReactions(raw: unknown): ReactionsByMessage {
  if (!raw || typeof raw !== 'object') return {}
  const out: ReactionsByMessage = {}
  for (const [messageId, perEmoji] of Object.entries(raw as Record<string, unknown>)) {
    if (!perEmoji || typeof perEmoji !== 'object') continue
    const chips: Record<string, ReactionChip> = {}
    for (const [emoji, chipRaw] of Object.entries(perEmoji as Record<string, unknown>)) {
      const chip = parseHistoryReactionChip(chipRaw)
      if (chip && chip.count > 0) {
        chips[emoji] = chip
      }
    }
    if (Object.keys(chips).length > 0) {
      out[messageId] = chips
    }
  }
  return out
}
