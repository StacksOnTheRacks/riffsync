import { PUBLIC_CATALOG_CATEGORIES, type CatalogEpisode } from './catalogTypes'

const PUBLIC_SEO_CATEGORIES = new Set<string>(PUBLIC_CATALOG_CATEGORIES)

/** Read-time default: missing or invalid values behave as YouTube host. */
export function readCatalogPlaybackHost(
  ep: Pick<CatalogEpisode, 'playbackHost'>,
): 'youtube' | 'custom' {
  return ep.playbackHost === 'custom' ? 'custom' : 'youtube'
}

/**
 * Whether the episode earns a sitemap `/watch/:id` entry and watch-route prerender.
 * Custom-host rows and `catalog: live` rows are never indexable as `/watch/:id`
 * (official Live SEO is owned by `/live/:slug`). YouTube-host rows require a
 * non-empty video id. Categories withheld from public browse are not indexable.
 * embedAllows and customPlaybackUrl do not affect indexability.
 */
export function episodeIsIndexableForSeo(ep: CatalogEpisode): boolean {
  if (ep.catalog === 'live') {
    return false
  }
  if (!PUBLIC_SEO_CATEGORIES.has(ep.catalog)) {
    return false
  }
  if (readCatalogPlaybackHost(ep) === 'custom') {
    return false
  }
  const id = ep.youtubeVideoId?.trim() ?? ''
  return id !== ''
}

export function catalogEntriesIndexableForSeo(entries: CatalogEpisode[]): CatalogEpisode[] {
  return entries.filter(episodeIsIndexableForSeo)
}
