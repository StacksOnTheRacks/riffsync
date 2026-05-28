import {
  canAcceptReactionAdd,
  reactionActionForToggle,
  type ReactionChip,
} from './chatReactions'
import { ChatReactionPicker } from './ChatReactionPicker'

export type ChatReactionsStripProps = {
  messageId: string
  chips: Record<string, ReactionChip>
  canReact: boolean
  onToggleReaction: (messageId: string, emoji: string, reactionAction: 'add' | 'remove') => void
}

export function ChatReactionsStrip({
  messageId,
  chips,
  canReact,
  onToggleReaction,
}: ChatReactionsStripProps) {
  const entries = Object.entries(chips).filter(([, chip]) => chip.count > 0)
  const showStrip = entries.length > 0 || canReact

  if (!showStrip) return null

  const handleChipClick = (emoji: string, reactedByMe: boolean) => {
    if (!canReact) return
    onToggleReaction(messageId, emoji, reactionActionForToggle(reactedByMe))
  }

  const handlePickerEmoji = (emoji: string) => {
    if (!canReact) return
    const existing = chips[emoji]
    if (existing) {
      onToggleReaction(messageId, emoji, reactionActionForToggle(existing.reactedByMe))
      return
    }
    if (!canAcceptReactionAdd(chips, emoji)) return
    onToggleReaction(messageId, emoji, 'add')
  }

  return (
    <div className="riffsync-room-chat-reactions" role="group" aria-label="Message reactions">
      {entries.map(([emoji, chip]) => (
        <button
          key={emoji}
          type="button"
          className={`riffsync-room-chat-reaction-chip${chip.reactedByMe ? ' riffsync-room-chat-reaction-chip--mine' : ''}`}
          disabled={!canReact}
          aria-pressed={chip.reactedByMe}
          aria-label={
            canReact
              ? `${chip.reactedByMe ? 'Remove' : 'Add'} reaction ${emoji}, ${chip.count} total`
              : `${emoji} reaction, ${chip.count}`
          }
          onClick={() => handleChipClick(emoji, chip.reactedByMe)}
        >
          <span className="riffsync-room-chat-reaction-chip__emoji" aria-hidden="true">
            {emoji}
          </span>
          <span className="riffsync-room-chat-reaction-chip__count">{chip.count}</span>
        </button>
      ))}
      {canReact ? <ChatReactionPicker onEmojiSelected={handlePickerEmoji} /> : null}
    </div>
  )
}
