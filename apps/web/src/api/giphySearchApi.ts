import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

export type GiphySearchResult = {
  giphyId: string
  title?: string
  previewUrl: string
  renditionUrl: string
  width?: number
  height?: number
}

export type GiphySearchParams = {
  q: string
  limit?: number
  offset?: number
}

function giphyAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }
}

function formatGiphyHttpError(prefix: string, status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { error?: string; message?: string }
    const detail = parsed.error ?? parsed.message
    if (typeof detail === 'string' && detail.trim() !== '') {
      return `${prefix} (${status}): ${detail}`
    }
  } catch {
    /* use raw body */
  }
  const trimmed = bodyText.trim()
  return trimmed ? `${prefix} (${status}): ${trimmed}` : `${prefix} (${status})`
}

export async function searchGiphy(
  accessToken: string,
  params: GiphySearchParams,
): Promise<{ results: GiphySearchResult[] }> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')

  const q = params.q.trim()
  if (q === '') throw new Error('Enter a search term.')

  const search = new URLSearchParams({ q })
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.offset !== undefined) search.set('offset', String(params.offset))

  const res = await fetch(`${base}/v1/giphy/search?${search.toString()}`, {
    headers: giphyAuthHeaders(accessToken),
  })

  if (res.status === 401) throw new Error('Sign in again — token rejected')
  if (res.status === 400) {
    const t = await res.text()
    throw new Error(formatGiphyHttpError('Giphy search failed', 400, t))
  }
  if (res.status === 429) {
    const t = await res.text()
    throw new Error(formatGiphyHttpError('Giphy search rate limit exceeded', 429, t))
  }
  if (!res.ok) {
    const t = await res.text()
    throw new Error(formatGiphyHttpError('Giphy search failed', res.status, t))
  }

  const payload = (await res.json()) as { results?: GiphySearchResult[] }
  return { results: Array.isArray(payload.results) ? payload.results : [] }
}
