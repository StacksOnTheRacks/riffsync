import type { CatalogEra } from './catalogTypes'
import type { StaffCatalogEpisode } from './staffCatalogTypes'

export type StaffCatalogFilterEra = CatalogEra | 'all'

export interface StaffCatalogFilterOptions {
  query: string
  era: StaffCatalogFilterEra
}

export function filterStaffCatalogEntries(
  entries: StaffCatalogEpisode[],
  { query, era }: StaffCatalogFilterOptions,
): StaffCatalogEpisode[] {
  const trimmed = query.trim()
  const qLower = trimmed.toLowerCase()

  let filtered = entries

  if (era !== 'all') {
    filtered = filtered.filter((entry) => entry.era === era)
  }

  if (trimmed) {
    filtered = filtered.filter((entry) => {
      const experimentStr = String(entry.experimentNumber)
      return (
        entry.id.toLowerCase().includes(qLower) ||
        entry.title.toLowerCase().includes(qLower) ||
        experimentStr.includes(trimmed)
      )
    })
  }

  return [...filtered].sort((a, b) => a.experimentNumber - b.experimentNumber)
}
