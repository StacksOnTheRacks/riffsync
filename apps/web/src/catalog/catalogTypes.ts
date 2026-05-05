/**
 * Shape aligned with `data/catalog/catalog.schema.json` episode `$defs.episode`
 * plus optional API-only hints (**`docs/api.catalog.md`**, **`architecture.frontend.md`**).
 */
export type CatalogEra = 'joel' | 'mike' | 'jonah' | 'emily' | 'other'

/** Title-case label for chips and banners (e.g. `joel` → Joel). */
export function formatCatalogEraLabel(era: CatalogEra): string {
  return era.replace(/^./, (c) => c.toUpperCase())
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
  /** When true, row appears in **`GET /v1/catalog?carousel=true`** and home carousels. */
  carousel: boolean
  /** When `false`, in-app YouTube embed should not be offered for this row. */
  embedAllows?: boolean
  /** Advisory label for ads vs Premium (honor-system). */
  playbackExpectation?: PlaybackExpectation
}

export interface CatalogBundle {
  version: 1
  updated?: string | null
  entries: CatalogEpisode[]
}
