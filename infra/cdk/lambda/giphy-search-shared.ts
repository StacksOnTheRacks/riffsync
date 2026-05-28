export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GiphySearchResult = {
  giphyId: string;
  title?: string;
  previewUrl: string;
  renditionUrl: string;
  width?: number;
  height?: number;
};

export type GiphySearchQuery = {
  q: string;
  limit: number;
  offset: number;
};

const GIPHY_SEARCH_BASE = 'https://api.giphy.com/v1/gifs/search';
const GIPHY_CDN_HOST_SUFFIX = '.giphy.com';

export function jsonResponse(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

export function parseGiphyApiKey(secretString: string): string | null {
  const t = secretString.trim();
  if (t.length === 0) return null;
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as { apiKey?: string; api_key?: string; key?: string };
      const v = j.apiKey ?? j.api_key ?? j.key;
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    } catch {
      /* plain text */
    }
  }
  if (t.includes('REPLACE')) return null;
  return t;
}

export function parseGiphySearchQuery(
  rawQuery: Record<string, string | undefined> | undefined,
): { ok: true; query: GiphySearchQuery } | { ok: false } {
  const qRaw = rawQuery?.q;
  if (typeof qRaw !== 'string') {
    return { ok: false };
  }
  const q = qRaw.trim();
  if (q.length < 1 || q.length > 50) {
    return { ok: false };
  }

  let limit = 20;
  const limitRaw = rawQuery?.limit;
  if (limitRaw !== undefined && limitRaw !== '') {
    const n = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 25) {
      return { ok: false };
    }
    limit = n;
  }

  let offset = 0;
  const offsetRaw = rawQuery?.offset;
  if (offsetRaw !== undefined && offsetRaw !== '') {
    const n = Number.parseInt(offsetRaw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 4999) {
      return { ok: false };
    }
    offset = n;
  }

  return { ok: true, query: { q, limit, offset } };
}

export function isHttpsGiphyCdnUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'giphy.com' || host.endsWith(GIPHY_CDN_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function parseDimension(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

type GiphyImageVariant = {
  url?: string;
  width?: string | number;
  height?: string | number;
};

type GiphyGifPayload = {
  id?: string;
  title?: string;
  images?: Record<string, GiphyImageVariant | undefined>;
};

function pickImageVariant(
  images: Record<string, GiphyImageVariant | undefined> | undefined,
  keys: string[],
): GiphyImageVariant | undefined {
  if (!images) return undefined;
  for (const key of keys) {
    const v = images[key];
    if (v && typeof v.url === 'string' && v.url.trim() !== '') {
      return v;
    }
  }
  return undefined;
}

export function normalizeGiphySearchPayload(payload: unknown): GiphySearchResult[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const results: GiphySearchResult[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const gif = item as GiphyGifPayload;
    const giphyId = typeof gif.id === 'string' ? gif.id.trim() : '';
    if (!giphyId) continue;

    const preview = pickImageVariant(gif.images, ['fixed_height_small', 'preview_gif', 'downsized']);
    const rendition = pickImageVariant(gif.images, ['fixed_height', 'downsized_medium', 'original']);
    const previewUrl = preview?.url?.trim() ?? '';
    const renditionUrl = rendition?.url?.trim() ?? '';
    if (!isHttpsGiphyCdnUrl(previewUrl) || !isHttpsGiphyCdnUrl(renditionUrl)) {
      continue;
    }

    const title =
      typeof gif.title === 'string' && gif.title.trim() !== '' ? gif.title.trim().slice(0, 200) : undefined;

    const width = parseDimension(rendition?.width ?? preview?.width);
    const height = parseDimension(rendition?.height ?? preview?.height);

    const entry: GiphySearchResult = {
      giphyId,
      previewUrl,
      renditionUrl,
    };
    if (title) entry.title = title;
    if (width !== undefined) entry.width = width;
    if (height !== undefined) entry.height = height;
    results.push(entry);
  }

  return results;
}

export function minuteBucketEpochMs(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 60_000) * 60_000;
}

export function giphyRateLimitKey(sub: string, bucketMs: number): { pk: string; sk: string } {
  return { pk: `giphy-rate#${sub}`, sk: String(bucketMs) };
}

export async function fetchGiphySearch(
  apiKey: string,
  query: GiphySearchQuery,
  fetchImpl: FetchLike,
): Promise<{ ok: true; results: GiphySearchResult[] } | { ok: false; status: 502 | 503 }> {
  const url = new URL(GIPHY_SEARCH_BASE);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('q', query.q);
  url.searchParams.set('limit', String(query.limit));
  url.searchParams.set('offset', String(query.offset));
  url.searchParams.set('rating', 'pg-13');

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      headers: { accept: 'application/json' },
    });
  } catch (e) {
    console.error('Giphy search request failed', e);
    return { ok: false, status: 502 };
  }

  if (res.status === 429 || res.status >= 500) {
    return { ok: false, status: res.status === 503 ? 503 : 502 };
  }

  if (!res.ok) {
    console.error('Giphy search unexpected status', res.status);
    return { ok: false, status: 502 };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (e) {
    console.error('Giphy search JSON parse failed', e);
    return { ok: false, status: 502 };
  }

  return { ok: true, results: normalizeGiphySearchPayload(payload) };
}
