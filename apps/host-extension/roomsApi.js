import { getPublicApiBaseUrl } from './publicApiBaseUrl.js'

const CATALOG_ERROR_CODES = new Set([
  'catalog_episode_not_found',
  'catalog_episode_youtube_id_missing',
  'catalog_episode_custom_url_missing',
])

function isRecord(value) {
  return typeof value === 'object' && value !== null
}

function roomUrl(base, roomId) {
  return `${base}/v1/rooms/${encodeURIComponent(roomId)}`
}

function errorResult(reason, extra = {}) {
  return { ok: false, status: 'error', reason, ...extra }
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

export async function fetchRoomNowPlaying(baseUrl, roomId, fetchImpl = globalThis.fetch) {
  if (typeof roomId !== 'string' || roomId.length === 0) {
    return { ok: false, status: 'unbound', reason: 'unbound' }
  }

  const base = getPublicApiBaseUrl(baseUrl)
  if (!base) {
    return errorResult('invalid-base-url')
  }

  let response
  try {
    response = await fetchImpl(roomUrl(base, roomId), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
  } catch {
    return errorResult('network')
  }

  if (!response || typeof response.status !== 'number') {
    return errorResult('network')
  }

  if (response.status === 404) {
    return { ok: false, status: 'missing', reason: 'missing' }
  }

  if (!response.ok) {
    return errorResult('http', { httpStatus: response.status })
  }

  let body
  try {
    body = await response.json()
  } catch {
    return errorResult('malformed')
  }
  if (!isRecord(body) || !isRecord(body.room)) {
    return { ok: false, status: 'missing', reason: 'missing' }
  }

  return { ok: true, status: 'ok', room: body.room }
}

function catalogCodeFromBody(body) {
  if (!isRecord(body) || typeof body.code !== 'string') return undefined
  return CATALOG_ERROR_CODES.has(body.code) ? body.code : undefined
}

export async function patchRoomCatalogEpisode(
  baseUrl,
  { roomId, accessToken, catalogEpisodeId },
  fetchImpl = globalThis.fetch,
) {
  const base = getPublicApiBaseUrl(baseUrl)
  if (!base) {
    return { ok: false, status: 0, reason: 'invalid-base-url' }
  }

  let response
  try {
    response = await fetchImpl(roomUrl(base, roomId), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ catalogEpisodeId }),
    })
  } catch {
    return { ok: false, status: 0, reason: 'network' }
  }

  if (!response || typeof response.status !== 'number') {
    return { ok: false, status: 0, reason: 'network' }
  }

  const body = await readJson(response)

  if (response.status === 200) {
    if (!isRecord(body)) {
      return { ok: false, status: 200, reason: 'malformed' }
    }
    return { ok: true, status: 200, body }
  }

  return {
    ok: false,
    status: response.status,
    reason: response.status === 0 ? 'network' : 'http',
    code: catalogCodeFromBody(body),
  }
}
