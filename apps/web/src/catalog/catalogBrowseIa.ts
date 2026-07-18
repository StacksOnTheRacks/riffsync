import type { CatalogEra } from './catalogTypes'

/** Route-fixed subcategory browse destinations (M32 browse IA). */
export const CATALOG_SUBCATEGORIES = [
  {
    slug: 'mst3k',
    path: '/catalog/mst3k',
    label: 'MST3K',
    subtitle: '"Push the button, Frank"',
    eras: ['joel', 'mike', 'jonah', 'emily'] as const satisfies readonly CatalogEra[],
  },
  {
    slug: 'community',
    path: '/catalog/community',
    label: 'Community',
    subtitle: 'Community Made Riffs',
    eras: ['community'] as const satisfies readonly CatalogEra[],
  },
  {
    slug: 'riff-ready',
    path: '/catalog/riff-ready',
    label: 'Riff-Ready',
    subtitle: 'Cheesy Flicks Ready to Riff',
    eras: ['riffable'] as const satisfies readonly CatalogEra[],
  },
  {
    slug: 'movie-night',
    path: '/catalog/movie-night',
    label: 'Movie Night',
    subtitle: 'Pull the Family Together for a Movie Night',
    eras: ['movie_night'] as const satisfies readonly CatalogEra[],
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
