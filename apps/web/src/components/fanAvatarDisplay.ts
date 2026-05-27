/** First grapheme of trimmed display name, uppercased; neutral fallback when empty. */
export function avatarInitialFromDisplayName(displayName: string): string {
  const trimmed = displayName.trim()
  if (!trimmed) return '?'
  const chars = [...trimmed]
  return chars[0]!.toLocaleUpperCase('en-US')
}

/** Server-supplied avatar URLs must be non-empty HTTPS (client never sends URLs on the wire). */
export function isHttpsAvatarUrl(url: string | undefined | null): url is string {
  if (url == null) return false
  const trimmed = url.trim()
  if (trimmed === '') return false
  try {
    return new URL(trimmed).protocol === 'https:'
  } catch {
    return false
  }
}
