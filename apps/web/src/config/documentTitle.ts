/** Shown last in routed document titles — tab picker, bookmarks, stacked tabs */
export const SITE_DOCUMENT_TITLE = 'RiffSync'

const ELL = '\u2026'

/** Truncate long episode/room titles so leading role labels stay visible in constrained UIs */
export function trimTabTitleSegment(value: string, maxChars = 70): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}${ELL}`
}
