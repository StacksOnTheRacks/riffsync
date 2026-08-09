import type { CatalogCategory, CatalogEpisode } from './catalogTypes'

export const MST3K_DEFAULT_SUBTITLE = '"Push the button, Frank"'
export const MST3K_SHORT_LABEL = 'Short'
/** Same badge string MST3K uses; RiffTrax Movies/Shorts split on this label. */
export const RIFFTRAX_SHORT_LABEL = MST3K_SHORT_LABEL

export const MST3K_SEASON_NAV_LINKS = Array.from({ length: 12 }, (_, index) => {
  const seasonNumber = index + 1
  return {
    label: `Season ${seasonNumber}`,
    href: `/catalog/mst3k/season/${seasonNumber}`,
    seasonNumber,
    tag: `Season: ${seasonNumber}`,
  }
})

export const MST3K_ERA_NAV_LINKS = [
  {
    slug: 'joel',
    label: 'Joel',
    href: '/catalog/mst3k/era/joel',
    subtitle: 'Joel Era',
    tag: 'Era: Joel',
  },
  {
    slug: 'mike',
    label: 'Mike',
    href: '/catalog/mst3k/era/mike',
    subtitle: 'Mike Era',
    tag: 'Era: Mike',
  },
  {
    slug: 'jonah',
    label: 'Jonah',
    href: '/catalog/mst3k/era/jonah',
    subtitle: 'Jonah Era',
    tag: 'Era: Jonah',
  },
  {
    slug: 'emily',
    label: 'Emily',
    href: '/catalog/mst3k/era/emily',
    subtitle: 'Emily Era',
    tag: 'Era: Emily',
  },
] as const

export const MST3K_SHORTS_NAV_LINK = {
  label: 'Shorts',
  href: '/catalog/mst3k/shorts',
  subtitle: 'Short Riffs',
  labelFilter: MST3K_SHORT_LABEL,
} as const

export const RIFFTRAX_MOVIES_NAV_LINK = {
  label: 'Movies',
  href: '/catalog/rifftrax/movies',
  subtitle: 'RiffTrax Movies',
} as const

export const RIFFTRAX_SHORTS_NAV_LINK = {
  label: 'Shorts',
  href: '/catalog/rifftrax/shorts',
  subtitle: 'RiffTrax Shorts',
  labelFilter: RIFFTRAX_SHORT_LABEL,
} as const

export type Mst3kCatalogRouteFilter =
  | { kind: 'all' }
  | { kind: 'season'; tag: string; seasonNumber: number }
  | { kind: 'era'; tag: string; slug: string }
  | { kind: 'shorts'; label: typeof MST3K_SHORT_LABEL }

export type RifftraxCatalogRouteFilter =
  | { kind: 'movies' }
  | { kind: 'shorts'; label: typeof RIFFTRAX_SHORT_LABEL }

/**
 * Route-fixed subcategory browse destinations (M32 browse IA).
 * Movie Night remains in admin/data but is omitted here until YouTube license
 * churn for those titles can be managed reliably.
 */
export const CATALOG_SUBCATEGORIES = [
  {
    slug: 'mst3k',
    path: '/catalog/mst3k',
    label: 'MST3K',
    subtitle: MST3K_DEFAULT_SUBTITLE,
    catalog: 'mst3k' as const satisfies CatalogCategory,
  },
  {
    slug: 'rifftrax',
    path: '/catalog/rifftrax',
    label: 'RiffTrax',
    subtitle: RIFFTRAX_MOVIES_NAV_LINK.subtitle,
    catalog: 'rifftrax' as const satisfies CatalogCategory,
  },
  {
    slug: 'community',
    path: '/catalog/community',
    label: 'Community',
    subtitle: 'Community Made Riffs',
    catalog: 'community' as const satisfies CatalogCategory,
  },
  {
    slug: 'riff-material',
    path: '/catalog/riff-material',
    label: 'Riff Material',
    subtitle: 'Cheesy Flicks Ready to Riff',
    catalog: 'riff_material' as const satisfies CatalogCategory,
  },
] as const

export type CatalogSubcategory = (typeof CATALOG_SUBCATEGORIES)[number]
export type CatalogSubcategorySlug = CatalogSubcategory['slug']

/** Public catalog hub entry links (same order and labels as subcategory routes). */
export const CATALOG_HUB_ENTRY_LINKS = CATALOG_SUBCATEGORIES.map(({ label, path }) => ({
  label,
  href: path,
}))

export function getCatalogSubcategoryByPath(pathname: string): CatalogSubcategory | undefined {
  return CATALOG_SUBCATEGORIES.find((entry) => entry.path === pathname)
}

export interface CatalogBrowseView {
  subcategory: CatalogSubcategory
  title: CatalogSubcategory['label']
  subtitle: string
  mst3kRouteFilter?: Mst3kCatalogRouteFilter
  rifftraxRouteFilter?: RifftraxCatalogRouteFilter
}

function getMst3kSubcategory(): CatalogSubcategory {
  return CATALOG_SUBCATEGORIES[0]
}

function getRifftraxSubcategory(): CatalogSubcategory {
  return CATALOG_SUBCATEGORIES[1]
}

export function filterRifftraxCatalogEntriesByRouteFilter(
  entries: readonly CatalogEpisode[],
  routeFilter: RifftraxCatalogRouteFilter = { kind: 'movies' },
): CatalogEpisode[] {
  if (routeFilter.kind === 'shorts') {
    return entries.filter((entry) => entry.labels.includes(routeFilter.label))
  }

  return entries.filter((entry) => !entry.labels.includes(RIFFTRAX_SHORT_LABEL))
}

export function getCatalogBrowseViewByPath(pathname: string): CatalogBrowseView | undefined {
  const exactSubcategory = getCatalogSubcategoryByPath(pathname)
  if (exactSubcategory) {
    return {
      subcategory: exactSubcategory,
      title: exactSubcategory.label,
      subtitle: exactSubcategory.subtitle,
      mst3kRouteFilter: exactSubcategory.slug === 'mst3k' ? { kind: 'all' } : undefined,
      rifftraxRouteFilter: exactSubcategory.slug === 'rifftrax' ? { kind: 'movies' } : undefined,
    }
  }

  const mst3kSubcategory = getMst3kSubcategory()
  const seasonMatch = /^\/catalog\/mst3k\/season\/(\d+)$/.exec(pathname)
  if (seasonMatch) {
    const seasonNumber = Number.parseInt(seasonMatch[1] ?? '', 10)
    const seasonLink = MST3K_SEASON_NAV_LINKS.find((entry) => entry.seasonNumber === seasonNumber)
    if (!seasonLink) return undefined
    return {
      subcategory: mst3kSubcategory,
      title: mst3kSubcategory.label,
      subtitle: seasonLink.label,
      mst3kRouteFilter: {
        kind: 'season',
        tag: seasonLink.tag,
        seasonNumber,
      },
    }
  }

  const eraMatch = /^\/catalog\/mst3k\/era\/([^/]+)$/.exec(pathname)
  if (eraMatch) {
    const eraSlug = eraMatch[1]
    const eraLink = MST3K_ERA_NAV_LINKS.find((entry) => entry.slug === eraSlug)
    if (!eraLink) return undefined
    return {
      subcategory: mst3kSubcategory,
      title: mst3kSubcategory.label,
      subtitle: eraLink.subtitle,
      mst3kRouteFilter: {
        kind: 'era',
        tag: eraLink.tag,
        slug: eraLink.slug,
      },
    }
  }

  if (pathname === MST3K_SHORTS_NAV_LINK.href) {
    return {
      subcategory: mst3kSubcategory,
      title: mst3kSubcategory.label,
      subtitle: MST3K_SHORTS_NAV_LINK.subtitle,
      mst3kRouteFilter: {
        kind: 'shorts',
        label: MST3K_SHORTS_NAV_LINK.labelFilter,
      },
    }
  }

  const rifftraxSubcategory = getRifftraxSubcategory()
  if (pathname === RIFFTRAX_MOVIES_NAV_LINK.href) {
    return {
      subcategory: rifftraxSubcategory,
      title: rifftraxSubcategory.label,
      subtitle: RIFFTRAX_MOVIES_NAV_LINK.subtitle,
      rifftraxRouteFilter: { kind: 'movies' },
    }
  }

  if (pathname === RIFFTRAX_SHORTS_NAV_LINK.href) {
    return {
      subcategory: rifftraxSubcategory,
      title: rifftraxSubcategory.label,
      subtitle: RIFFTRAX_SHORTS_NAV_LINK.subtitle,
      rifftraxRouteFilter: {
        kind: 'shorts',
        label: RIFFTRAX_SHORTS_NAV_LINK.labelFilter,
      },
    }
  }

  return undefined
}
