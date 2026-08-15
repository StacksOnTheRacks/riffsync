import { getPublicApiBaseUrl } from './publicApiBaseUrl.js'

const CATALOG_CATEGORIES = [
  'mst3k',
  'rifftrax',
  'community',
  'riff_material',
  'movie_night',
  'other',
  'live',
]

export const CATALOG_UNAVAILABLE_MESSAGE = 'Could not load the catalog library.'

function isRecord(value) {
  return typeof value === 'object' && value !== null
}

function asCatalogCategory(value) {
  const s = typeof value === 'string' ? value : ''
  if (CATALOG_CATEGORIES.includes(s)) return s
  return 'other'
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function asNullableString(value) {
  if (value === null || value === undefined) return null
  return String(value)
}

export function normalizeEpisode(raw) {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error('Catalog episode missing id')
  }

  return {
    id: raw.id,
    experimentNumber: Number(raw.experimentNumber),
    title: String(raw.title ?? ''),
    catalog: asCatalogCategory(raw.catalog),
    tags: asStringArray(raw.tags),
    labels: asStringArray(raw.labels),
    youtubeVideoId: asNullableString(raw.youtubeVideoId),
    youtubeWatchUrl: asNullableString(raw.youtubeWatchUrl),
    tagline: asNullableString(raw.tagline),
    posterImageUrl: asNullableString(raw.posterImageUrl),
    embedAllows:
      raw.embedAllows === false ? false : raw.embedAllows === true ? true : undefined,
    playbackHost: raw.playbackHost === 'custom' ? 'custom' : 'youtube',
    customPlaybackUrl: asNullableString(raw.customPlaybackUrl),
  }
}

function catalogListUrl(base) {
  return `${base}/v1/catalog`
}

function errorResult(reason, message = CATALOG_UNAVAILABLE_MESSAGE) {
  return { ok: false, status: 'error', reason, message, entries: [] }
}

export function selectCatalogRow(entries, id) {
  const row = Array.isArray(entries) ? entries.find((entry) => entry.id === id) : undefined
  if (!row) return { id: null, row: null }
  return { id: row.id, row }
}

export async function fetchPublicCatalog(baseUrl, fetchImpl = globalThis.fetch) {
  const base = getPublicApiBaseUrl(baseUrl)
  if (!base) {
    return errorResult('invalid-base-url', 'Public API base URL is missing or invalid.')
  }

  let response
  try {
    response = await fetchImpl(catalogListUrl(base), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
  } catch {
    return errorResult('network')
  }

  if (!response || typeof response.ok !== 'boolean' || !response.ok) {
    return errorResult('http')
  }

  let body
  try {
    body = await response.json()
  } catch {
    return errorResult('malformed')
  }

  if (!isRecord(body) || !Array.isArray(body.entries)) {
    return errorResult('malformed')
  }

  let entries
  try {
    entries = body.entries.map(normalizeEpisode)
  } catch {
    return errorResult('malformed')
  }

  if (entries.length === 0) {
    return {
      ok: true,
      status: 'empty',
      version: body.version,
      entries,
    }
  }

  return {
    ok: true,
    status: 'ok',
    version: body.version,
    entries,
  }
}
