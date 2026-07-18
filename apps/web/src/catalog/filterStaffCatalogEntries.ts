import type { CatalogCategory } from './catalogTypes'
import type { StaffCatalogEpisode } from './staffCatalogTypes'

export type StaffCatalogFilterCatalog = CatalogCategory | 'all'

export interface StaffCatalogFilterOptions {
  query: string
  catalog: StaffCatalogFilterCatalog
}

export function filterStaffCatalogEntries(
  entries: StaffCatalogEpisode[],
  { query, catalog }: StaffCatalogFilterOptions,
): StaffCatalogEpisode[] {
  const trimmed = query.trim()
  const qLower = trimmed.toLowerCase()

  let filtered = entries

  if (catalog !== 'all') {
    filtered = filtered.filter((entry) => entry.catalog === catalog)
  }

  if (trimmed) {
    filtered = filtered.filter((entry) => {
      const experimentStr = String(entry.experimentNumber)
      return (
        entry.id.toLowerCase().includes(qLower) ||
        entry.title.toLowerCase().includes(qLower) ||
        experimentStr.includes(trimmed) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(qLower)) ||
        entry.labels.some((label) => label.toLowerCase().includes(qLower))
      )
    })
  }

  return [...filtered].sort((a, b) => a.experimentNumber - b.experimentNumber)
}
