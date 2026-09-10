import { catalogEntriesVisibleInPublicBrowse } from '../../catalog/catalogPlayback'
import { formatCatalogLabel, type CatalogEpisode } from '../../catalog/catalogTypes'

export const GLOBAL_SEARCH_MAX_RESULTS = 8
export const GLOBAL_SEARCH_MAX_TAG_CHIPS = 3

function entryMatchesGlobalSearchQuery(entry: CatalogEpisode, qLower: string): boolean {
  if (entry.title.toLowerCase().includes(qLower)) {
    return true
  }
  if (entry.tags.some((tag) => tag.toLowerCase().includes(qLower))) {
    return true
  }
  return entry.labels.some((label) => label.toLowerCase().includes(qLower))
}

/** Client-side title, tag, and label search over public-browse catalog rows. */
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
    .filter((entry) => entryMatchesGlobalSearchQuery(entry, qLower))
    .slice(0, GLOBAL_SEARCH_MAX_RESULTS)
}

/** Tags/labels for a search row, excluding the category name already shown as a badge. */
export function searchResultTagChips(
  episode: CatalogEpisode,
  maxChips = GLOBAL_SEARCH_MAX_TAG_CHIPS,
): string[] {
  const categoryKey = formatCatalogLabel(episode.catalog).toLowerCase()
  const seen = new Set<string>([categoryKey])
  const chips: string[] = []
  const sources = episode.tags.length > 0 ? episode.tags : episode.labels

  for (const raw of sources) {
    const value = raw.trim()
    if (!value) {
      continue
    }
    const key = value.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    chips.push(value)
    if (chips.length >= maxChips) {
      break
    }
  }

  return chips
}
