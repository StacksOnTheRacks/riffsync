import type { CatalogBundle, CatalogEpisode, CatalogEra, PlaybackExpectation } from './catalogTypes'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

/** Default public catalog `Cache-Control` max-age when env does not override (see `docs/api.catalog.md`). */
export const CATALOG_HTTP_MAX_AGE_MS = 60_000

export type CatalogFetchResult<T> =
  | { kind: 'notModified' }
  | { kind: 'ok'; etag: string; data: T }

export type CatalogEpisodeByIdResult =
  | { kind: 'notModified' }
  | { kind: 'ok'; etag: string; entry: CatalogEpisode | null }

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

function parseCarouselFlag(v: unknown): boolean {
  if (v === true) return true
  if (v === false || v === null || v === undefined) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === 'true' || s === '1' || s === 'yes'
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v === 1
  return false
}

/** Trim and preserve weak ETag form for `If-None-Match` round-trips. */
export function normalizeCatalogEtag(header: string | null | undefined): string | undefined {
  if (header == null) return undefined
  const trimmed = header.trim()
  return trimmed.length > 0 ? trimmed : undefined
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
    carousel: parseCarouselFlag(raw.carousel),
    embedAllows:
      raw.embedAllows === false ? false : raw.embedAllows === true ? true : undefined,
    playbackExpectation: parsePlaybackExpectation(raw.playbackExpectation),
  }
}

async function loadDevSeedBundle(): Promise<CatalogBundle> {
  const mod = await import('../../../../data/catalog/episodes.json')
  return mod.default as CatalogBundle
}

async function catalogJsonGet(
  url: string,
  etag?: string,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (etag) {
    headers['If-None-Match'] = etag
  }
  return fetch(url, { headers })
}

function parseListBody(body: unknown): CatalogEpisode[] {
  if (!isRecord(body) || !Array.isArray(body.entries)) {
    throw new Error('Catalog response missing entries array')
  }
  return body.entries.map(normalizeEpisode)
}

/**
 * Read weak ETag from a CORS-visible response. When the header is hidden (misconfigured
 * `Access-Control-Expose-Headers`) but the JSON body is present, synthesize a validator
 * so the catalog can still load (conditional GET disabled until the next 200 with a real ETag).
 */
function readCatalogListEtag(res: Response, body: unknown, variant: 'full' | 'carousel'): string {
  const fromHeader = normalizeCatalogEtag(res.headers.get('ETag'))
  if (fromHeader) {
    return fromHeader
  }
  if (!isRecord(body) || !Array.isArray(body.entries)) {
    throw new Error('Catalog response missing ETag')
  }
  const version = typeof body.version === 'number' ? body.version : 0
  return `W/"fallback-${variant}-v${version}-n${body.entries.length}"`
}

export async function fetchCatalogEntries(etag?: string): Promise<CatalogFetchResult<CatalogEpisode[]>> {
  const base = getPublicApiBaseUrl()
  if (base) {
    const res = await catalogJsonGet(`${base}/v1/catalog`, etag)
    if (res.status === 304) {
      return { kind: 'notModified' }
    }
    if (!res.ok) {
      throw new Error(`Catalog request failed (${res.status})`)
    }
    const body = (await res.json()) as unknown
    const responseEtag = readCatalogListEtag(res, body, 'full')
    return { kind: 'ok', etag: responseEtag, data: parseListBody(body) }
  }

  if (import.meta.env.DEV) {
    const bundle = await loadDevSeedBundle()
    return {
      kind: 'ok',
      etag: 'dev-seed-full',
      data: bundle.entries.map(normalizeEpisode),
    }
  }

  throw new Error(
    'Set VITE_PUBLIC_API_BASE_URL at build time so the catalog can load from the API.',
  )
}

export async function fetchCatalogCarouselEntries(
  etag?: string,
): Promise<CatalogFetchResult<CatalogEpisode[]>> {
  const base = getPublicApiBaseUrl()
  if (base) {
    const url = new URL(`${base}/v1/catalog`)
    url.searchParams.set('carousel', 'true')
    const res = await catalogJsonGet(url.toString(), etag)
    if (res.status === 304) {
      return { kind: 'notModified' }
    }
    if (!res.ok) {
      throw new Error(`Catalog carousel request failed (${res.status})`)
    }
    const body = (await res.json()) as unknown
    const responseEtag = readCatalogListEtag(res, body, 'carousel')
    return { kind: 'ok', etag: responseEtag, data: parseListBody(body) }
  }

  if (import.meta.env.DEV) {
    const bundle = await loadDevSeedBundle()
    return {
      kind: 'ok',
      etag: 'dev-seed-carousel',
      data: bundle.entries.map(normalizeEpisode).filter((e) => e.carousel === true),
    }
  }

  throw new Error(
    'Set VITE_PUBLIC_API_BASE_URL at build time so the catalog carousel can load from the API.',
  )
}

export async function fetchCatalogEpisodeById(
  id: string,
  etag?: string,
): Promise<CatalogEpisodeByIdResult> {
  const base = getPublicApiBaseUrl()
  if (base) {
    const res = await catalogJsonGet(`${base}/v1/catalog/${encodeURIComponent(id)}`, etag)
    if (res.status === 304) {
      return { kind: 'notModified' }
    }
    if (res.status === 404) {
      const responseEtag = normalizeCatalogEtag(res.headers.get('ETag')) ?? ''
      return { kind: 'ok', etag: responseEtag, entry: null }
    }
    if (!res.ok) {
      throw new Error(`Catalog item request failed (${res.status})`)
    }
    const body = (await res.json()) as { entry?: unknown }
    if (!body.entry) {
      throw new Error('Catalog item response missing entry')
    }
    const responseEtag =
      normalizeCatalogEtag(res.headers.get('ETag')) ??
      `W/"fallback-episode-${id}"`
    return { kind: 'ok', etag: responseEtag, entry: normalizeEpisode(body.entry) }
  }

  const list = await fetchCatalogEntries()
  if (list.kind === 'notModified') {
    throw new Error('Catalog episode lookup requires a prior list cache in dev without API')
  }
  const entry = list.data.find((e) => e.id === id) ?? null
  return { kind: 'ok', etag: 'dev-seed-episode', entry }
}
