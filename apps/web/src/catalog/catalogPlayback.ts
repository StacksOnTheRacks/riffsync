import type { CatalogEpisode } from './catalogTypes'

/** Read-time default: missing or invalid values behave as YouTube host. */
export function readCatalogPlaybackHost(
  ep: Pick<CatalogEpisode, 'playbackHost'>,
): 'youtube' | 'custom' {
  return ep.playbackHost === 'custom' ? 'custom' : 'youtube'
}

/**
 * Whether the episode may appear in fan browse surfaces and enable tile actions.
 * Custom-host: trimmed HTTPS customPlaybackUrl. YouTube-host: non-empty youtubeVideoId.
 * embedAllows does not affect browse inclusion or tile enablement.
 */
export function episodeIsPlayableInApp(ep: CatalogEpisode): boolean {
  const host = readCatalogPlaybackHost(ep)
  if (host === 'custom') {
    const url = ep.customPlaybackUrl?.trim() ?? ''
    return url.startsWith('https://')
  }
  const id = ep.youtubeVideoId?.trim() ?? ''
  return id !== ''
}

export function catalogEntriesPlayableInApp(entries: CatalogEpisode[]): CatalogEpisode[] {
  return entries.filter(episodeIsPlayableInApp)
}
