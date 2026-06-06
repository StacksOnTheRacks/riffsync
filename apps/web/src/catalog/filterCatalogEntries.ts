import type { CatalogEra, CatalogEpisode } from './catalogTypes'

/** Default era toggles on the public catalog (Joel, Mike, Jonah). */
export const DEFAULT_CATALOG_FILTER_ERAS: readonly CatalogEra[] = ['joel', 'mike', 'jonah']

export interface CatalogFilterOptions {
  titleQuery: string
  /** Empty array means no era constraint. */
  eras: readonly CatalogEra[]
}

export function filterCatalogEntries(
  entries: CatalogEpisode[],
  { titleQuery, eras }: CatalogFilterOptions,
): CatalogEpisode[] {
  const trimmed = titleQuery.trim()
  const qLower = trimmed.toLowerCase()
  const eraSet = eras.length > 0 ? new Set(eras) : null

  let filtered = entries

  if (eraSet) {
    filtered = filtered.filter((entry) => eraSet.has(entry.era))
  }

  if (trimmed) {
    filtered = filtered.filter((entry) => entry.title.toLowerCase().includes(qLower))
  }

  return [...filtered].sort((a, b) => a.experimentNumber - b.experimentNumber)
}
