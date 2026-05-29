const EMOJI_SEQUENCE =
  /\p{Extended_Pictographic}(\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu

/** True when the message is only emoji (optional whitespace between sequences). */
export function isEmojiOnlyChatMessage(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  const withoutEmoji = trimmed.replace(EMOJI_SEQUENCE, '').replace(/\s/g, '')
  return withoutEmoji.length === 0
}
