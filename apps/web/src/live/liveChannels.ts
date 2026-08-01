/** Official Live channels use the catalog episode id as the public slug. */
export function getLivePathForEpisodeId(episodeId: string): string | undefined {
  const trimmed = episodeId.trim()
  if (!trimmed) return undefined
  return `/live/${encodeURIComponent(trimmed)}`
}
