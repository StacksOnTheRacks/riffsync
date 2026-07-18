/**
 * Shape aligned with `data/catalog/catalog.schema.json` episode `$defs.episode`
 * plus optional API-only hints (**`docs/api.catalog.md`**, **`architecture.frontend.md`**).
 */
export type CatalogCategory =
  | 'mst3k'
  | 'community'
  | 'riff_material'
  | 'movie_night'
  | 'other'

export const CATALOG_CATEGORIES: readonly CatalogCategory[] = [
  'mst3k',
  'community',
  'riff_material',
  'movie_night',
  'other',
]

/** Categories exposed on the public catalog surfaces (`other` is staff-only curation). */
export const PUBLIC_CATALOG_CATEGORIES: readonly CatalogCategory[] = [
  'mst3k',
  'community',
  'riff_material',
  'movie_night',
]

const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  mst3k: 'MST3K',
  community: 'Community',
  riff_material: 'Riff Material',
  movie_night: 'Movie Night',
  other: 'Other',
}

/** Display label for category filters, cards, and admin selects. */
export function formatCatalogLabel(catalog: CatalogCategory): string {
  return CATALOG_CATEGORY_LABELS[catalog]
}

/** Honor-system expectation for US-P0-07 (not verified server-side). */
export type PlaybackExpectation = 'premium' | 'ad_supported' | 'unknown'

export interface CatalogEpisode {
  id: string
  experimentNumber: number
  title: string
  catalog: CatalogCategory
  tags: string[]
  labels: string[]
  youtubeVideoId: string | null
  youtubeWatchUrl: string | null
  tagline: string | null
  posterImageUrl: string | null
  backdropImageUrl: string | null
  tmdbMovieId: number | null
  tmdbArtworkSyncedAt: string | null
  /** When true, row appears in **`GET /v1/catalog?carousel=true`** (home hero). */
  carousel: boolean
  /** When true, row appears in **`GET /v1/catalog?spotlight=true`** (home spotlight strip). */
  spotlight: boolean
  /** When `false`, in-app YouTube embed should not be offered for this row. */
  embedAllows?: boolean
  /** Advisory label for ads vs Premium (honor-system). */
  playbackExpectation?: PlaybackExpectation
  /** TMDB movie popularity from reconcile; higher = more popular on TMDB. */
  tmdbPopularity?: number | null
}

export interface CatalogBundle {
  version: 1
  updated?: string | null
  entries: CatalogEpisode[]
}
