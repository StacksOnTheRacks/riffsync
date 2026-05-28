export const MAX_DISTINCT_EMOJI_PER_MESSAGE = 12

export type ReactionChip = {
  count: number
  reactedByMe: boolean
}

/** messageId → emoji → aggregated chip */
export type ReactionsByMessage = Record<string, Record<string, ReactionChip>>

export function reactionActionForToggle(reactedByMe: boolean): 'add' | 'remove' {
  return reactedByMe ? 'remove' : 'add'
}

export function distinctEmojiCount(chips: Record<string, ReactionChip>): number {
  return Object.keys(chips).length
}

/** Client gate before sending `react` add when the distinct-emoji cap applies. */
export function canAcceptReactionAdd(
  chips: Record<string, ReactionChip>,
  emoji: string,
): boolean {
  if (chips[emoji] !== undefined) return true
  return distinctEmojiCount(chips) < MAX_DISTINCT_EMOJI_PER_MESSAGE
}

export function applyChatReactionEvent(
  prev: ReactionsByMessage,
  messageId: string,
  emoji: string,
  action: 'add' | 'remove',
  sessionId: string,
  mySessionId: string,
): ReactionsByMessage {
  const perMessage = { ...(prev[messageId] ?? {}) }
  const chip = perMessage[emoji] ?? { count: 0, reactedByMe: false }

  if (action === 'add') {
    const count = chip.count + 1
    const reactedByMe = chip.reactedByMe || sessionId === mySessionId
    perMessage[emoji] = { count, reactedByMe }
  } else {
    const count = Math.max(0, chip.count - 1)
    const reactedByMe = sessionId === mySessionId ? false : chip.reactedByMe
    if (count <= 0) {
      const rest = { ...perMessage }
      delete rest[emoji]
      if (Object.keys(rest).length === 0) {
        const next = { ...prev }
        delete next[messageId]
        return next
      }
      return { ...prev, [messageId]: rest }
    }
    perMessage[emoji] = { count, reactedByMe }
  }

  return { ...prev, [messageId]: perMessage }
}
