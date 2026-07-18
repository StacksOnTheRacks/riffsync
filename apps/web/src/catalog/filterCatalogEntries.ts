import type { CatalogCategory, CatalogEpisode } from './catalogTypes'

/** Default public category toggles when a category filter surface is present. */
export const DEFAULT_CATALOG_FILTER_CATEGORIES: readonly CatalogCategory[] = [
  'mst3k',
  'community',
  'riff_material',
  'movie_night',
]

export interface CatalogFilterOptions {
  titleQuery: string
  /** Empty array means no catalog/category constraint. */
  catalogs: readonly CatalogCategory[]
}

export function filterCatalogEntries(
  entries: CatalogEpisode[],
  { titleQuery, catalogs }: CatalogFilterOptions,
): CatalogEpisode[] {
  const trimmed = titleQuery.trim()
  const qLower = trimmed.toLowerCase()
  const catalogSet = catalogs.length > 0 ? new Set(catalogs) : null

  let filtered = entries

  if (catalogSet) {
    filtered = filtered.filter((entry) => catalogSet.has(entry.catalog))
  }

  if (trimmed) {
    filtered = filtered.filter((entry) => {
      return (
        entry.title.toLowerCase().includes(qLower) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(qLower)) ||
        entry.labels.some((label) => label.toLowerCase().includes(qLower))
      )
    })
  }

  return [...filtered].sort((a, b) => a.experimentNumber - b.experimentNumber)
}
