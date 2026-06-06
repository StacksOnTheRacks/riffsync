import type { CatalogEra, CatalogEpisode } from './catalogTypes'

const ERA_YOUTUBE_ROW_CAP = 10

/** True when the episode has a non-empty YouTube video id (in-app watch + thumbnails). */
export function episodeHasYoutubeLink(ep: CatalogEpisode): boolean {
  return ep.youtubeVideoId != null && ep.youtubeVideoId.trim() !== ''
}

export function catalogEntriesWithYoutubeLink(entries: CatalogEpisode[]): CatalogEpisode[] {
  return entries.filter(episodeHasYoutubeLink)
}

/**
 * Episodes for a host era that have a playable YouTube id, in experiment order.
 * Uses the full **`GET /v1/catalog`** list (already loaded on the home page).
 */
export function firstEpisodesWithYoutubeForEra(
  entries: CatalogEpisode[],
  era: CatalogEra,
  limit: number = ERA_YOUTUBE_ROW_CAP,
): CatalogEpisode[] {
  return entries
    .filter((e) => e.era === era && episodeHasYoutubeLink(e))
    .sort((a, b) => a.experimentNumber - b.experimentNumber)
    .slice(0, limit)
}

/** YouTube poster fallback when `posterImageUrl` / `backdropImageUrl` are null (dev/catalog seed). */
export function catalogStillImageUrl(ep: CatalogEpisode): string {
  if (ep.backdropImageUrl) return ep.backdropImageUrl
  if (ep.posterImageUrl) return ep.posterImageUrl
  if (ep.youtubeVideoId) {
    return `https://img.youtube.com/vi/${ep.youtubeVideoId}/hqdefault.jpg`
  }
  return '/design/images/background/asset-53.jpg'
}

/**
 * Landscape-friendly art for grid / row cards: YouTube still first (consistent ~16:9),
 * then wide backdrop; TMDB **poster** last — it is portrait and breaks row alignment.
 */
export function catalogCardImageUrl(ep: CatalogEpisode): string {
  if (ep.youtubeVideoId) {
    return `https://img.youtube.com/vi/${ep.youtubeVideoId}/hqdefault.jpg`
  }
  if (ep.backdropImageUrl) return ep.backdropImageUrl
  if (ep.posterImageUrl) return ep.posterImageUrl
  return '/design/images/background/asset-53.jpg'
}

export interface HeroSlide {
  episodeId: string
  /** Full catalog row for party creation + tile actions */
  episode: CatalogEpisode
  backgroundUrl: string
  title: string
  taglineHtml: string
  experimentNumber: number
  era: string
}

const HERO_SLIDE_CAP = 3

/** `entries` should be the curated carousel slice from **`GET /v1/catalog?carousel=true`**. */
export function buildHeroSlides(entries: CatalogEpisode[]): HeroSlide[] {
  return entries.slice(0, HERO_SLIDE_CAP).map((ep) => {
    const blurb =
      ep.tagline?.trim() ||
      `Experiment #${ep.experimentNumber}: Joel, Mike, Jonah, and friends riff on the film—in the not-too-distant future, this copy comes from the catalog API.`
    return {
      episodeId: ep.id,
      episode: ep,
      backgroundUrl: catalogStillImageUrl(ep),
      title: ep.title,
      taglineHtml: blurb,
      experimentNumber: ep.experimentNumber,
      era: ep.era,
    }
  })
}

export function cycleSlice(entries: CatalogEpisode[], start: number, count: number): CatalogEpisode[] {
  if (entries.length === 0) return []
  const out: CatalogEpisode[] = []
  for (let i = 0; i < count; i++) {
    out.push(entries[(start + i) % entries.length]!)
  }
  return out
}

function hasFiniteTmdbPopularity(ep: CatalogEpisode): boolean {
  return ep.tmdbPopularity != null && Number.isFinite(ep.tmdbPopularity)
}

/** Descending TMDB popularity; unreconciled rows trail in experiment order. */
export function compareByTmdbPopularity(a: CatalogEpisode, b: CatalogEpisode): number {
  const aHas = hasFiniteTmdbPopularity(a)
  const bHas = hasFiniteTmdbPopularity(b)
  if (aHas && bHas) {
    const diff = b.tmdbPopularity! - a.tmdbPopularity!
    return diff !== 0 ? diff : a.experimentNumber - b.experimentNumber
  }
  if (aHas !== bHas) return aHas ? -1 : 1
  return a.experimentNumber - b.experimentNumber
}

/** Playable episodes ranked by **`tmdbPopularity`** (reconcile), with optional offset for a second row. */
export function topEpisodesByTmdbPopularity(
  entries: CatalogEpisode[],
  limit: number,
  offset = 0,
): CatalogEpisode[] {
  return [...entries].sort(compareByTmdbPopularity).slice(offset, offset + limit)
}
