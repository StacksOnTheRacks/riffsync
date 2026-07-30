import type { CatalogCategory, CatalogEpisode } from './catalogTypes'
import { episodeIsPlayableInApp } from './catalogPlayback'

const ERA_PLAYABLE_ROW_CAP = 10
export const CATALOG_VIDEO_PLACEHOLDER_IMAGE_URL = '/design/images/background/video-placeholder.png'

/** @deprecated SEO scripts (#397) still import this; fan browse uses catalogPlayback helpers. */
export function episodeHasYoutubeLink(ep: CatalogEpisode): boolean {
  return ep.youtubeVideoId != null && ep.youtubeVideoId.trim() !== ''
}

/** @deprecated SEO scripts (#397) still import this; fan browse uses catalogEntriesPlayableInApp. */
export function catalogEntriesWithYoutubeLink(entries: CatalogEpisode[]): CatalogEpisode[] {
  return entries.filter(episodeHasYoutubeLink)
}

/**
 * Episodes for a metadata tag that are playable in-app, in experiment order.
 * Uses the full **`GET /v1/catalog`** list (already loaded on the home page).
 */
export function firstEpisodesPlayableForTag(
  entries: CatalogEpisode[],
  tag: string,
  limit: number = ERA_PLAYABLE_ROW_CAP,
): CatalogEpisode[] {
  return entries
    .filter((e) => e.tags.includes(tag) && episodeIsPlayableInApp(e))
    .sort((a, b) => a.experimentNumber - b.experimentNumber)
    .slice(0, limit)
}

/** @deprecated Use firstEpisodesPlayableForTag on fan browse paths. */
export function firstEpisodesWithYoutubeForTag(
  entries: CatalogEpisode[],
  tag: string,
  limit: number = ERA_PLAYABLE_ROW_CAP,
): CatalogEpisode[] {
  return firstEpisodesPlayableForTag(entries, tag, limit)
}

/** YouTube poster fallback when `posterImageUrl` / `backdropImageUrl` are null (dev/catalog seed). */
export function catalogStillImageUrl(ep: CatalogEpisode): string {
  if (ep.backdropImageUrl) return ep.backdropImageUrl
  if (ep.posterImageUrl) return ep.posterImageUrl
  if (ep.youtubeVideoId) {
    return `https://img.youtube.com/vi/${ep.youtubeVideoId}/hqdefault.jpg`
  }
  return CATALOG_VIDEO_PLACEHOLDER_IMAGE_URL
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
  return CATALOG_VIDEO_PLACEHOLDER_IMAGE_URL
}

export interface HeroSlide {
  episodeId: string
  /** Full catalog row for party creation + tile actions */
  episode: CatalogEpisode
  backgroundUrl: string
  title: string
  taglineHtml: string
  experimentNumber: number
  catalog: string
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
      catalog: ep.catalog,
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

/** Catalog categories included in the home page Most Popular row. */
export const HOME_MOST_POPULAR_INCLUDED_CATEGORIES: readonly CatalogCategory[] = ['mst3k']

/** Playable episodes ranked by **`tmdbPopularity`** (reconcile), with optional offset for a second row. */
export function topEpisodesByTmdbPopularity(
  entries: CatalogEpisode[],
  limit: number,
  offset = 0,
): CatalogEpisode[] {
  return [...entries].sort(compareByTmdbPopularity).slice(offset, offset + limit)
}

/** Most Popular home row: ranked popularity for MST3K catalog items only. */
export function topEpisodesForHomeMostPopular(
  entries: CatalogEpisode[],
  limit: number,
): CatalogEpisode[] {
  const included = new Set(HOME_MOST_POPULAR_INCLUDED_CATEGORIES)
  const eligible = entries.filter((entry) => included.has(entry.catalog))
  return topEpisodesByTmdbPopularity(eligible, limit)
}
