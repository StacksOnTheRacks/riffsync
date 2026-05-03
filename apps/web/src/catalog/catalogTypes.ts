/**
 * Shape aligned with `data/catalog/catalog.schema.json` episode `$defs.episode`.
 * M3 home uses mocks only; M4 will swap to GET /v1/catalog.
 */
export type CatalogEra = 'joel' | 'mike' | 'jonah' | 'emily' | 'other'

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
}

export interface CatalogBundle {
  version: 1
  updated?: string | null
  entries: CatalogEpisode[]
}
