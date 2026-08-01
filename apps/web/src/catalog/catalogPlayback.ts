import { PUBLIC_CATALOG_CATEGORIES, type CatalogEpisode } from './catalogTypes'

const PUBLIC_BROWSE_CATEGORIES = new Set<string>(PUBLIC_CATALOG_CATEGORIES)

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

/** Playable rows in categories exposed on public home/catalog surfaces. */
export function catalogEntriesVisibleInPublicBrowse(
  entries: CatalogEpisode[],
): CatalogEpisode[] {
  return catalogEntriesPlayableInApp(entries).filter((ep) =>
    PUBLIC_BROWSE_CATEGORIES.has(ep.catalog),
  )
}
