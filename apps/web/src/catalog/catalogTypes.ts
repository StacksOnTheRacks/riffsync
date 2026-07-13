/**
 * Shape aligned with `data/catalog/catalog.schema.json` episode `$defs.episode`
 * plus optional API-only hints (**`docs/api.catalog.md`**, **`architecture.frontend.md`**).
 */
export type CatalogEra =
  | 'joel'
  | 'mike'
  | 'jonah'
  | 'emily'
  | 'community'
  | 'movie_night'
  | 'riffable'
  | 'other'

export const CATALOG_ERAS: readonly CatalogEra[] = [
  'joel',
  'mike',
  'jonah',
  'emily',
  'community',
  'movie_night',
  'riffable',
  'other',
]

/** Eras exposed on the public catalog filter bar (`other` is staff-only curation). */
export const PUBLIC_CATALOG_ERAS: readonly CatalogEra[] = [
  'joel',
  'mike',
  'jonah',
  'emily',
  'community',
  'movie_night',
  'riffable',
]

const CATALOG_ERA_LABELS: Record<CatalogEra, string> = {
  joel: 'Joel',
  mike: 'Mike',
  jonah: 'Jonah',
  emily: 'Emily',
  community: 'Community',
  movie_night: 'Movie Night',
  riffable: 'Riffable',
  other: 'Other',
}

/** Display label for era chips, filters, and admin selects. */
export function formatCatalogEraLabel(era: CatalogEra): string {
  return CATALOG_ERA_LABELS[era]
}

/** Honor-system expectation for US-P0-07 (not verified server-side). */
export type PlaybackExpectation = 'premium' | 'ad_supported' | 'unknown'

export interface CatalogEpisode {
  id: string
  experimentNumber: number
  title: string
  era: CatalogEra
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
