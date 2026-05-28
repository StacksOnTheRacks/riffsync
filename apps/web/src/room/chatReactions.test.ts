import { describe, expect, it } from 'vitest'
import {
  MAX_DISTINCT_EMOJI_PER_MESSAGE,
  applyChatReactionEvent,
  canAcceptReactionAdd,
  reactionActionForToggle,
  type ReactionChip,
  type ReactionsByMessage,
} from './chatReactions'

const MY = 'session-me'
const OTHER = 'session-other'

describe('reactionActionForToggle', () => {
  it('returns remove when already reacted', () => {
    expect(reactionActionForToggle(true)).toBe('remove')
  })

  it('returns add when not reacted', () => {
    expect(reactionActionForToggle(false)).toBe('add')
  })
})

describe('canAcceptReactionAdd', () => {
  it('allows add when under distinct-emoji cap', () => {
    const chips: Record<string, ReactionChip> = {}
    for (let i = 0; i < MAX_DISTINCT_EMOJI_PER_MESSAGE - 1; i += 1) {
      chips[`e${i}`] = { count: 1, reactedByMe: false }
    }
    expect(canAcceptReactionAdd(chips, '🆕')).toBe(true)
  })

  it('blocks new emoji at cap unless that emoji already exists', () => {
    const chips: Record<string, ReactionChip> = {}
    for (let i = 0; i < MAX_DISTINCT_EMOJI_PER_MESSAGE; i += 1) {
      chips[`e${i}`] = { count: 1, reactedByMe: false }
    }
    expect(canAcceptReactionAdd(chips, '🆕')).toBe(false)
    expect(canAcceptReactionAdd(chips, 'e0')).toBe(true)
  })
})

describe('applyChatReactionEvent', () => {
  it('aggregates add from multiple sessions', () => {
    let state: ReactionsByMessage = {}
    state = applyChatReactionEvent(state, 'm1', '👍', 'add', MY, MY)
    state = applyChatReactionEvent(state, 'm1', '👍', 'add', OTHER, MY)
    expect(state.m1?.['👍']).toEqual({ count: 2, reactedByMe: true })
  })

  it('marks reactedByMe only for the local session', () => {
    let state: ReactionsByMessage = {}
    state = applyChatReactionEvent(state, 'm1', '❤️', 'add', OTHER, MY)
    expect(state.m1?.['❤️']).toEqual({ count: 1, reactedByMe: false })
  })

  it('removes chip when count reaches zero', () => {
    let state: ReactionsByMessage = {}
    state = applyChatReactionEvent(state, 'm1', '🔥', 'add', MY, MY)
    state = applyChatReactionEvent(state, 'm1', '🔥', 'remove', MY, MY)
    expect(state.m1).toBeUndefined()
  })

  it('clears reactedByMe for local session on remove', () => {
    let state: ReactionsByMessage = {}
    state = applyChatReactionEvent(state, 'm1', '👏', 'add', MY, MY)
    state = applyChatReactionEvent(state, 'm1', '👏', 'add', OTHER, MY)
    state = applyChatReactionEvent(state, 'm1', '👏', 'remove', MY, MY)
    expect(state.m1?.['👏']).toEqual({ count: 1, reactedByMe: false })
  })

  it('keeps reactedByMe when another session removes theirs', () => {
    let state: ReactionsByMessage = {}
    state = applyChatReactionEvent(state, 'm1', '🎉', 'add', MY, MY)
    state = applyChatReactionEvent(state, 'm1', '🎉', 'add', OTHER, MY)
    state = applyChatReactionEvent(state, 'm1', '🎉', 'remove', OTHER, MY)
    expect(state.m1?.['🎉']).toEqual({ count: 1, reactedByMe: true })
  })
})
