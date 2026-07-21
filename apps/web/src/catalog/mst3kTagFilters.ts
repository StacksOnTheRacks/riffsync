import type { CatalogEpisode } from './catalogTypes'
import { filterCatalogEntries, type CatalogFilterOptions } from './filterCatalogEntries'

/** Tag namespaces rendered as pill filters on `/catalog/mst3k`. */
export const MST3K_TAG_PILL_NAMESPACES = ['Era', 'Season'] as const

export type Mst3kTagPillNamespace = (typeof MST3K_TAG_PILL_NAMESPACES)[number]

export type SelectedMst3kTagPills = Readonly<Record<Mst3kTagPillNamespace, readonly string[]>>

export const EMPTY_MST3K_TAG_PILLS: SelectedMst3kTagPills = {
  Era: [],
  Season: [],
}

export interface Mst3kCatalogFilterOptions extends CatalogFilterOptions {
  selectedTagPills?: SelectedMst3kTagPills
}

function tagNamespace(tag: string): string | null {
  const colonIndex = tag.indexOf(':')
  if (colonIndex <= 0) return null
  return tag.slice(0, colonIndex).trim()
}

function seasonSortKey(tag: string): number {
  const value = tag.slice(tag.indexOf(':') + 1).trim()
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

export function compareMst3kTagPillLabels(a: string, b: string): number {
  const namespaceA = tagNamespace(a)
  const namespaceB = tagNamespace(b)
  if (namespaceA === 'Season' && namespaceB === 'Season') {
    const byNumber = seasonSortKey(a) - seasonSortKey(b)
    if (byNumber !== 0) return byNumber
  }
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

/** Distinct full tag strings for a namespace from the loaded MST3K result set. */
export function deriveMst3kTagPillOptions(
  entries: readonly CatalogEpisode[],
  namespace: Mst3kTagPillNamespace,
): string[] {
  const prefix = `${namespace}:`
  const tagSet = new Set<string>()

  for (const entry of entries) {
    for (const tag of entry.tags) {
      if (tag.startsWith(prefix)) {
        tagSet.add(tag)
      }
    }
  }

  return [...tagSet].sort(compareMst3kTagPillLabels)
}

export function filterCatalogEntriesByTagPills(
  entries: readonly CatalogEpisode[],
  selectedTagPills: SelectedMst3kTagPills,
): CatalogEpisode[] {
  const activeNamespaces = MST3K_TAG_PILL_NAMESPACES.filter(
    (namespace) => selectedTagPills[namespace].length > 0,
  )

  if (activeNamespaces.length === 0) {
    return [...entries]
  }

  return entries.filter((entry) =>
    activeNamespaces.every((namespace) =>
      selectedTagPills[namespace].some((tag) => entry.tags.includes(tag)),
    ),
  )
}

export function filterMst3kCatalogEntries(
  entries: CatalogEpisode[],
  options: Mst3kCatalogFilterOptions,
): CatalogEpisode[] {
  const { selectedTagPills = EMPTY_MST3K_TAG_PILLS, ...catalogOptions } = options
  const catalogFiltered = filterCatalogEntries(entries, catalogOptions)
  const tagFiltered = filterCatalogEntriesByTagPills(catalogFiltered, selectedTagPills)
  return [...tagFiltered].sort((a, b) => a.experimentNumber - b.experimentNumber)
}

export function toggleMst3kTagPill(
  selectedTagPills: SelectedMst3kTagPills,
  tag: string,
): SelectedMst3kTagPills {
  const namespace = tagNamespace(tag)
  if (namespace !== 'Era' && namespace !== 'Season') {
    return selectedTagPills
  }

  const current = selectedTagPills[namespace]
  const next = current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]

  return {
    ...selectedTagPills,
    [namespace]: next,
  }
}
