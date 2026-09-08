import { catalogEntriesVisibleInPublicBrowse } from '../../catalog/catalogPlayback'
import type { CatalogEpisode } from '../../catalog/catalogTypes'

export const GLOBAL_SEARCH_MAX_RESULTS = 8

/** Client-side title search over public-browse catalog rows (v1 global search). */
export function filterGlobalSearchCatalogTitles(
  entries: readonly CatalogEpisode[],
  query: string,
): CatalogEpisode[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  const qLower = trimmed.toLowerCase()
  const visible = catalogEntriesVisibleInPublicBrowse([...entries])

  return visible
    .filter((entry) => entry.title.toLowerCase().includes(qLower))
    .slice(0, GLOBAL_SEARCH_MAX_RESULTS)
}
