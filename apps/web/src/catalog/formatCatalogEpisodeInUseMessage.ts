export function formatCatalogEpisodeInUseMessage(references: {
  rooms: number
  lists: number
}): string {
  const segments: string[] = []
  if (references.rooms > 0) {
    segments.push(`${references.rooms} active watch party room(s)`)
  }
  if (references.lists > 0) {
    segments.push(`${references.lists} list(s)`)
  }
  if (segments.length === 0) {
    return 'Cannot delete — this episode is used by rooms or lists.'
  }
  return `Cannot delete — this episode is used by ${segments.join(' and/or ')}.`
}
