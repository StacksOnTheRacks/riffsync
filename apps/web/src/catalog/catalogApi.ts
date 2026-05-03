import type { CatalogBundle, CatalogEpisode, CatalogEra, PlaybackExpectation } from './catalogTypes'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function asEra(v: unknown): CatalogEra {
  const s = typeof v === 'string' ? v : ''
  if (s === 'joel' || s === 'mike' || s === 'jonah' || s === 'emily' || s === 'other') {
    return s
  }
  return 'other'
}

function parsePlaybackExpectation(v: unknown): PlaybackExpectation | undefined {
  if (v === 'premium' || v === 'ad_supported' || v === 'unknown') return v
  return undefined
}

export function normalizeEpisode(raw: unknown): CatalogEpisode {
  if (!isRecord(raw)) {
    throw new Error('Catalog episode must be an object')
  }
  if (typeof raw.id !== 'string') {
    throw new Error('Catalog episode missing id')
  }
  return {
    id: raw.id,
    experimentNumber: Number(raw.experimentNumber),
    title: String(raw.title),
    era: asEra(raw.era),
    youtubeVideoId:
      raw.youtubeVideoId === null || raw.youtubeVideoId === undefined
        ? null
        : String(raw.youtubeVideoId),
    youtubeWatchUrl:
      raw.youtubeWatchUrl === null || raw.youtubeWatchUrl === undefined
        ? null
        : String(raw.youtubeWatchUrl),
    tagline:
      raw.tagline === null || raw.tagline === undefined ? null : String(raw.tagline),
    posterImageUrl:
      raw.posterImageUrl === null || raw.posterImageUrl === undefined
        ? null
        : String(raw.posterImageUrl),
    backdropImageUrl:
      raw.backdropImageUrl === null || raw.backdropImageUrl === undefined
        ? null
        : String(raw.backdropImageUrl),
    tmdbMovieId:
      raw.tmdbMovieId === null || raw.tmdbMovieId === undefined
        ? null
        : Number(raw.tmdbMovieId),
    tmdbArtworkSyncedAt:
      raw.tmdbArtworkSyncedAt === null || raw.tmdbArtworkSyncedAt === undefined
        ? null
        : String(raw.tmdbArtworkSyncedAt),
    carousel: raw.carousel === true,
    embedAllows:
      raw.embedAllows === false ? false : raw.embedAllows === true ? true : undefined,
    playbackExpectation: parsePlaybackExpectation(raw.playbackExpectation),
  }
}

async function loadDevSeedBundle(): Promise<CatalogBundle> {
  const mod = await import('../../../../data/catalog/episodes.json')
  return mod.default as CatalogBundle
}

export async function fetchCatalogEntries(): Promise<CatalogEpisode[]> {
  const base = getPublicApiBaseUrl()
  if (base) {
    const res = await fetch(`${base}/v1/catalog`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`Catalog request failed (${res.status})`)
    }
    const body = (await res.json()) as { entries?: unknown[] }
    if (!Array.isArray(body.entries)) {
      throw new Error('Catalog response missing entries array')
    }
    return body.entries.map(normalizeEpisode)
  }

  if (import.meta.env.DEV) {
    const bundle = await loadDevSeedBundle()
    return bundle.entries.map(normalizeEpisode)
  }

  throw new Error(
    'Set VITE_PUBLIC_API_BASE_URL at build time so the catalog can load from the API.',
  )
}

export async function fetchCatalogCarouselEntries(): Promise<CatalogEpisode[]> {
  const base = getPublicApiBaseUrl()
  if (base) {
    const url = new URL(`${base}/v1/catalog`)
    url.searchParams.set('carousel', 'true')
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`Catalog carousel request failed (${res.status})`)
    }
    const body = (await res.json()) as { entries?: unknown[] }
    if (!Array.isArray(body.entries)) {
      throw new Error('Catalog carousel response missing entries array')
    }
    return body.entries.map(normalizeEpisode)
  }

  if (import.meta.env.DEV) {
    const bundle = await loadDevSeedBundle()
    return bundle.entries
      .map(normalizeEpisode)
      .filter((e) => e.carousel === true)
  }

  throw new Error(
    'Set VITE_PUBLIC_API_BASE_URL at build time so the catalog carousel can load from the API.',
  )
}

export async function fetchCatalogEpisodeById(id: string): Promise<CatalogEpisode | null> {
  const base = getPublicApiBaseUrl()
  if (base) {
    const res = await fetch(`${base}/v1/catalog/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    })
    if (res.status === 404) return null
    if (!res.ok) {
      throw new Error(`Catalog item request failed (${res.status})`)
    }
    const body = (await res.json()) as { entry?: unknown }
    if (!body.entry) {
      throw new Error('Catalog item response missing entry')
    }
    return normalizeEpisode(body.entry)
  }

  const entries = await fetchCatalogEntries()
  return entries.find((e) => e.id === id) ?? null
}
