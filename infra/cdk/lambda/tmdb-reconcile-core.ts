/**
 * TMDB catalog reconciliation (bounded batch). See **`docs/contracts.tmdb.md`**.
 * Does **not** persist TMDB **`title`** / **`original_title`** — catalog **`title`** stays canonical.
 */

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface TmdbImageConfig {
  readonly secureBaseUrl: string;
  readonly posterSize: string;
  readonly backdropSize: string;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const FALLBACK_BASE = 'https://image.tmdb.org/t/p/';
const SLEEP_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function buildResolvedImageUrl(
  config: TmdbImageConfig,
  role: 'poster' | 'backdrop',
  filePath: string | null | undefined,
): string | null {
  if (!filePath || filePath.trim() === '') return null;
  const size = role === 'poster' ? config.posterSize : config.backdropSize;
  const base = config.secureBaseUrl.endsWith('/') ? config.secureBaseUrl : `${config.secureBaseUrl}/`;
  const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
  return `${base}${size}${path}`;
}

export async function fetchTmdbImageConfig(token: string, fetchImpl: FetchLike): Promise<TmdbImageConfig> {
  const res = await fetchImpl(`${TMDB_BASE}/configuration`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TMDB configuration failed (${res.status})`);
  }
  const data = (await res.json()) as {
    images?: { secure_base_url?: string; poster_sizes?: string[]; backdrop_sizes?: string[] };
  };
  const rawBase = data.images?.secure_base_url?.trim();
  const secureBaseUrl =
    rawBase && rawBase.length > 0
      ? rawBase.endsWith('/')
        ? rawBase
        : `${rawBase}/`
      : FALLBACK_BASE;
  const posterSizes = data.images?.poster_sizes ?? ['w500'];
  const backdropSizes = data.images?.backdrop_sizes ?? ['w780'];
  const posterSize = posterSizes.includes('w500') ? 'w500' : posterSizes.find((s) => /^w\d+/.test(s)) ?? 'w342';
  const backdropSize = backdropSizes.includes('w780')
    ? 'w780'
    : backdropSizes.find((s) => /^w\d+/.test(s)) ?? 'w1280';

  return { secureBaseUrl, posterSize, backdropSize };
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, accept: 'application/json' };
}

export interface TmdbMovieDetailJson {
  readonly id?: number;
  readonly tagline?: string | null;
  readonly overview?: string | null;
  readonly popularity?: number | null;
  readonly poster_path?: string | null;
  readonly backdrop_path?: string | null;
}

export function mapMovieDetailToDynamoPatch(
  movie: TmdbMovieDetailJson,
  imageConfig: TmdbImageConfig,
  nowIso: string,
): Record<string, unknown> {
  const tmdbMovieId = typeof movie.id === 'number' ? movie.id : null;
  const tagline =
    movie.tagline === null || movie.tagline === undefined ? null : String(movie.tagline);
  const tmdbOverview =
    movie.overview === null || movie.overview === undefined ? null : String(movie.overview);
  const tmdbPopularity =
    movie.popularity === null || movie.popularity === undefined ? null : Number(movie.popularity);
  const tmdbPosterPath =
    movie.poster_path === null || movie.poster_path === undefined
      ? null
      : String(movie.poster_path);
  const tmdbBackdropPath =
    movie.backdrop_path === null || movie.backdrop_path === undefined
      ? null
      : String(movie.backdrop_path);

  const posterImageUrl = buildResolvedImageUrl(imageConfig, 'poster', tmdbPosterPath);
  const backdropImageUrl = buildResolvedImageUrl(imageConfig, 'backdrop', tmdbBackdropPath);

  return {
    tagline,
    tmdbOverview: tmdbOverview ?? null,
    tmdbPopularity: Number.isFinite(tmdbPopularity as number) ? tmdbPopularity : null,
    tmdbMovieId,
    tmdbPosterPath,
    tmdbBackdropPath,
    posterImageUrl,
    backdropImageUrl,
    tmdbArtworkSyncedAt: nowIso,
    tmdbNeedsReview: false,
  };
}

/** Curator **`movieSearchTitle`** when set, else episode **`title`** (see architecture.catalog-images.md). */
export function resolveTmdbSearchTitle(item: Record<string, unknown>): string {
  const hint = String(item.movieSearchTitle ?? '').trim();
  if (hint.length > 0) return hint;
  return String(item.title ?? '').trim();
}

/** Stamp skipped search outcomes so they leave the batch queue and surface in admin. */
export function mapSkipToDynamoPatch(
  reason: string | undefined,
  nowIso: string,
): Record<string, unknown> | null {
  switch (reason) {
    case 'ambiguous_search':
    case 'no_search_results':
    case 'no_title':
      return {
        tmdbNeedsReview: true,
        tmdbArtworkSyncedAt: nowIso,
      };
    default:
      return null;
  }
}

/** Prefer single search hit; multiple hits = ambiguous (skip). */
export function resolveMovieIdFromSearch(
  results: readonly { id?: number }[],
): { movieId: number } | 'none' | 'ambiguous' {
  if (results.length === 0) return 'none';
  if (results.length > 1) return 'ambiguous';
  const rid = results[0]?.id;
  if (typeof rid !== 'number' || !Number.isFinite(rid)) return 'none';
  return { movieId: rid };
}

export function itemNeedsReconcile(item: Record<string, unknown>): boolean {
  const posterMissing = item.posterImageUrl == null || item.posterImageUrl === '';
  const movieId = item.tmdbMovieId;
  const hasPinnedId = typeof movieId === 'number' && movieId > 0;

  if (hasPinnedId && posterMissing) {
    return true;
  }

  const searchHint = String(item.movieSearchTitle ?? '').trim();
  if (posterMissing && searchHint.length > 0) {
    return true;
  }

  if (item.tmdbNeedsReview === true && posterMissing) {
    return false;
  }

  const syncedAt = item.tmdbArtworkSyncedAt;
  return syncedAt == null || syncedAt === '';
}

async function tmdbGet(pathAndQuery: string, token: string, fetchImpl: FetchLike): Promise<Response> {
  return fetchImpl(`${TMDB_BASE}${pathAndQuery}`, { headers: authHeaders(token) });
}

export type ReconcileItemResult =
  | { ok: true; catalogId: string; patch: Record<string, unknown> }
  | {
      ok: false;
      status: 'skipped' | 'failed';
      catalogId?: string;
      reason?: string;
      patch?: Record<string, unknown>;
    };

function skippedResult(
  catalogId: string,
  reason: string,
  nowIso: string,
): ReconcileItemResult {
  const patch = mapSkipToDynamoPatch(reason, nowIso);
  return {
    ok: false,
    status: 'skipped',
    catalogId,
    reason,
    ...(patch ? { patch } : {}),
  };
}

export async function reconcileOneItemForPatch(
  item: Record<string, unknown>,
  token: string,
  imageConfig: TmdbImageConfig,
  fetchImpl: FetchLike,
  nowIso: string,
): Promise<ReconcileItemResult> {
  const cid = item.id;
  if (typeof cid !== 'string') {
    return { ok: false, status: 'failed', reason: 'missing_id' };
  }

  try {
    let movieId: number | null =
      typeof item.tmdbMovieId === 'number' && item.tmdbMovieId > 0 ? item.tmdbMovieId : null;

    if (movieId == null) {
      const searchTitle = resolveTmdbSearchTitle(item);
      if (!searchTitle) {
        return skippedResult(cid, 'no_title', nowIso);
      }
      await sleep(SLEEP_MS);
      const searchRes = await tmdbGet(
        `/search/movie?query=${encodeURIComponent(searchTitle)}&include_adult=false&language=en-US&page=1`,
        token,
        fetchImpl,
      );
      if (!searchRes.ok) {
        return { ok: false, status: 'failed', catalogId: cid, reason: `search_${searchRes.status}` };
      }
      const searchBody = (await searchRes.json()) as { results?: { id?: number }[] };
      const resolved = resolveMovieIdFromSearch(searchBody.results ?? []);
      if (resolved === 'none' || resolved === 'ambiguous') {
        return skippedResult(
          cid,
          resolved === 'ambiguous' ? 'ambiguous_search' : 'no_search_results',
          nowIso,
        );
      }
      movieId = resolved.movieId;
    }

    await sleep(SLEEP_MS);
    const movieRes = await tmdbGet(`/movie/${movieId}?language=en-US`, token, fetchImpl);
    if (!movieRes.ok) {
      return { ok: false, status: 'failed', catalogId: cid, reason: `movie_${movieRes.status}` };
    }

    const movieJson = (await movieRes.json()) as TmdbMovieDetailJson;
    const patch = mapMovieDetailToDynamoPatch(movieJson, imageConfig, nowIso);
    return { ok: true, catalogId: cid, patch };
  } catch (e) {
    return {
      ok: false,
      status: 'failed',
      catalogId: cid,
      reason: e instanceof Error ? e.message : 'exception',
    };
  }
}
