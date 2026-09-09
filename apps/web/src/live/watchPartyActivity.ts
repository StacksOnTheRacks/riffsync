export function formatWatchPartyActivity(lastActivityAt: number | undefined): string {
  if (typeof lastActivityAt !== 'number' || !Number.isFinite(lastActivityAt)) return ''
  const sec = Math.max(0, Math.floor((Date.now() - lastActivityAt) / 1000))
  if (sec < 45) return 'Active just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `Active ${min}m ago`
  const hr = Math.floor(min / 60)
  return `Active ${hr}h ago`
}

export function watchPartyHeadline(room: { displayTitle?: string; catalogEpisodeId: string }): string {
  return room.displayTitle?.trim() || room.catalogEpisodeId
}

export function watchPartyRoomPath(roomId: string): string {
  return `/room/${encodeURIComponent(roomId)}`
}
