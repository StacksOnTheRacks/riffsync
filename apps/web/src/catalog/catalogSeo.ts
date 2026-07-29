import type { CatalogEpisode } from './catalogTypes'

/** Read-time default: missing or invalid values behave as YouTube host. */
export function readCatalogPlaybackHost(
  ep: Pick<CatalogEpisode, 'playbackHost'>,
): 'youtube' | 'custom' {
  return ep.playbackHost === 'custom' ? 'custom' : 'youtube'
}

/**
 * Whether the episode earns a sitemap `/watch/:id` entry and watch-route prerender.
 * Custom-host rows are never indexable. YouTube-host rows require a non-empty video id.
 * embedAllows and customPlaybackUrl do not affect indexability.
 */
export function episodeIsIndexableForSeo(ep: CatalogEpisode): boolean {
  if (readCatalogPlaybackHost(ep) === 'custom') {
    return false
  }
  const id = ep.youtubeVideoId?.trim() ?? ''
  return id !== ''
}

export function catalogEntriesIndexableForSeo(entries: CatalogEpisode[]): CatalogEpisode[] {
  return entries.filter(episodeIsIndexableForSeo)
}
