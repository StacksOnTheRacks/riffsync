export function nowPlayingLabel(room, libraryEntries = []) {
  if (!room || typeof room !== 'object') return ''

  const displayTitle = typeof room.displayTitle === 'string' ? room.displayTitle.trim() : ''
  if (displayTitle) return displayTitle

  const catalogEpisodeId =
    typeof room.catalogEpisodeId === 'string' ? room.catalogEpisodeId : ''
  const row = Array.isArray(libraryEntries)
    ? libraryEntries.find((entry) => entry.id === catalogEpisodeId)
    : undefined
  const libraryTitle = typeof row?.title === 'string' ? row.title.trim() : ''
  if (libraryTitle) return libraryTitle

  return catalogEpisodeId
}
