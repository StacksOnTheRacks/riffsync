import type { CatalogCategory, CatalogEpisode } from '../catalog/catalogTypes'

/** Sidebar categories for Load Media (fixed order; TV Shows appended when present in cache). */
export const LOAD_MEDIA_BASE_CATEGORIES: readonly CatalogCategory[] = [
  'mst3k',
  'rifftrax',
  'community',
  'riff_material',
  'movie_night',
]

export const LOAD_MEDIA_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  mst3k: 'MST3K',
  rifftrax: 'RiffTrax',
  community: 'Community',
  riff_material: 'Riff Material',
  movie_night: 'Movies',
  tv_shows: 'TV Shows',
  other: 'Other',
  live: 'Live',
}

export function loadMediaSidebarCategories(entries: CatalogEpisode[]): CatalogCategory[] {
  const hasTvShows = entries.some((ep) => ep.catalog === 'tv_shows')
  return hasTvShows
    ? [...LOAD_MEDIA_BASE_CATEGORIES, 'tv_shows']
    : [...LOAD_MEDIA_BASE_CATEGORIES]
}

export function loadMediaCategoryLabel(catalog: CatalogCategory): string {
  return LOAD_MEDIA_CATEGORY_LABELS[catalog] ?? catalog
}
