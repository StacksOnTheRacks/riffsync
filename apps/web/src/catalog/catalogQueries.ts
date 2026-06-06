import {
  useQuery,
  type QueryClient,
  type QueryFunctionContext,
} from '@tanstack/react-query'
import {
  fetchCatalogCarouselEntries,
  fetchCatalogSpotlightEntries,
  fetchCatalogEntries,
  fetchCatalogEpisodeById,
  CATALOG_HTTP_MAX_AGE_MS,
  type CatalogFetchResult,
} from './catalogApi'
import type { CatalogEpisode } from './catalogTypes'

export const catalogListFullQueryKey = ['catalog', 'list', 'full'] as const
export const catalogListCarouselQueryKey = ['catalog', 'list', 'carousel'] as const
export const catalogListSpotlightQueryKey = ['catalog', 'list', 'spotlight'] as const

export function catalogEpisodeQueryKey(id: string) {
  return ['catalog', 'episode', id] as const
}

const etagByQueryKey = new Map<string, string>()

function queryKeyStorageKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey)
}

function getStoredEtag(queryKey: readonly unknown[]): string | undefined {
  return etagByQueryKey.get(queryKeyStorageKey(queryKey))
}

function setStoredEtag(queryKey: readonly unknown[], etag: string): void {
  etagByQueryKey.set(queryKeyStorageKey(queryKey), etag)
}

function clearStoredEtag(queryKey: readonly unknown[]): void {
  etagByQueryKey.delete(queryKeyStorageKey(queryKey))
}

/** Clears in-memory conditional GET validators (survives SPA navigation; not tied to React Query GC). */
export function clearStoredCatalogEtags(): void {
  etagByQueryKey.clear()
}

function resolveNotModified<T>(
  client: QueryClient,
  queryKey: readonly unknown[],
): T | undefined {
  return client.getQueryData<T>(queryKey)
}

async function finishCatalogListResult(
  ctx: QueryFunctionContext<readonly ['catalog', 'list', string]>,
  result: CatalogFetchResult<CatalogEpisode[]>,
  tryFetch: (etag?: string) => Promise<CatalogFetchResult<CatalogEpisode[]>>,
): Promise<CatalogEpisode[]> {
  if (result.kind === 'notModified') {
    const cached = resolveNotModified<CatalogEpisode[]>(ctx.client, ctx.queryKey)
    if (cached !== undefined) {
      return cached
    }
    clearStoredEtag(ctx.queryKey)
    return finishCatalogListResult(ctx, await tryFetch(undefined), tryFetch)
  }
  setStoredEtag(ctx.queryKey, result.etag)
  return result.data
}

export async function runCatalogListQuery(
  ctx: QueryFunctionContext<readonly ['catalog', 'list', string]>,
  fetcher: (etag?: string) => Promise<CatalogFetchResult<CatalogEpisode[]>>,
): Promise<CatalogEpisode[]> {
  const tryFetch = async (etag?: string) => fetcher(etag)

  const etag = getStoredEtag(ctx.queryKey)
  try {
    return await finishCatalogListResult(ctx, await tryFetch(etag), tryFetch)
  } catch (error) {
    if (!etag) {
      throw error
    }
    clearStoredEtag(ctx.queryKey)
    const cached = resolveNotModified<CatalogEpisode[]>(ctx.client, ctx.queryKey)
    if (cached !== undefined) {
      return cached
    }
    return finishCatalogListResult(ctx, await tryFetch(undefined), tryFetch)
  }
}

async function finishCatalogEpisodeResult(
  ctx: QueryFunctionContext<ReturnType<typeof catalogEpisodeQueryKey>>,
  result: Awaited<ReturnType<typeof fetchCatalogEpisodeById>>,
  tryFetch: (etag?: string) => ReturnType<typeof fetchCatalogEpisodeById>,
): Promise<CatalogEpisode | null> {
  if (result.kind === 'notModified') {
    const cached = resolveNotModified<CatalogEpisode | null>(ctx.client, ctx.queryKey)
    if (cached !== undefined) {
      return cached
    }
    clearStoredEtag(ctx.queryKey)
    return finishCatalogEpisodeResult(ctx, await tryFetch(undefined), tryFetch)
  }
  if (result.etag) {
    setStoredEtag(ctx.queryKey, result.etag)
  }
  return result.entry
}

async function runCatalogEpisodeQuery(
  ctx: QueryFunctionContext<ReturnType<typeof catalogEpisodeQueryKey>>,
): Promise<CatalogEpisode | null> {
  const id = ctx.queryKey[2]
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Catalog episode query requires an id')
  }

  const tryFetch = async (etag?: string) => fetchCatalogEpisodeById(id, etag)

  const etag = getStoredEtag(ctx.queryKey)
  try {
    return await finishCatalogEpisodeResult(ctx, await tryFetch(etag), tryFetch)
  } catch (error) {
    if (!etag) {
      throw error
    }
    clearStoredEtag(ctx.queryKey)
    const cached = resolveNotModified<CatalogEpisode | null>(ctx.client, ctx.queryKey)
    if (cached !== undefined) {
      return cached
    }
    return finishCatalogEpisodeResult(ctx, await tryFetch(undefined), tryFetch)
  }
}

export function invalidatePublicCatalogQueries(queryClient: QueryClient): Promise<void> {
  clearStoredCatalogEtags()
  return queryClient.invalidateQueries({ queryKey: ['catalog'] })
}

export function useCatalogListQuery() {
  return useQuery({
    queryKey: catalogListFullQueryKey,
    queryFn: (ctx) => runCatalogListQuery(ctx, fetchCatalogEntries),
    staleTime: CATALOG_HTTP_MAX_AGE_MS,
  })
}

export function useCatalogCarouselQuery() {
  return useQuery({
    queryKey: catalogListCarouselQueryKey,
    queryFn: (ctx) => runCatalogListQuery(ctx, fetchCatalogCarouselEntries),
    staleTime: CATALOG_HTTP_MAX_AGE_MS,
  })
}

export function useCatalogSpotlightQuery() {
  return useQuery({
    queryKey: catalogListSpotlightQueryKey,
    queryFn: (ctx) => runCatalogListQuery(ctx, fetchCatalogSpotlightEntries),
    staleTime: CATALOG_HTTP_MAX_AGE_MS,
  })
}

export function useCatalogEpisodeQuery(id: string | undefined) {
  return useQuery({
    queryKey: catalogEpisodeQueryKey(id ?? ''),
    queryFn: runCatalogEpisodeQuery,
    staleTime: CATALOG_HTTP_MAX_AGE_MS,
    enabled: typeof id === 'string' && id.length > 0,
  })
}
