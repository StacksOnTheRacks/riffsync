import {
  useQuery,
  type QueryClient,
  type QueryFunctionContext,
} from '@tanstack/react-query'
import {
  fetchCatalogCarouselEntries,
  fetchCatalogEntries,
  fetchCatalogEpisodeById,
  CATALOG_HTTP_MAX_AGE_MS,
  type CatalogFetchResult,
  type CatalogEpisodeByIdResult,
} from './catalogApi'
import type { CatalogEpisode } from './catalogTypes'

export const catalogListFullQueryKey = ['catalog', 'list', 'full'] as const
export const catalogListCarouselQueryKey = ['catalog', 'list', 'carousel'] as const

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
  label: string,
): T | undefined {
  const cached = client.getQueryData<T>(queryKey)
  if (cached === undefined) {
    return undefined
  }
  return cached
}

async function runCatalogListQuery(
  ctx: QueryFunctionContext<readonly ['catalog', 'list', string]>,
  fetcher: (etag?: string) => Promise<CatalogFetchResult<CatalogEpisode[]>>,
): Promise<CatalogEpisode[]> {
  const tryFetch = async (etag?: string) => fetcher(etag)

  let etag = getStoredEtag(ctx.queryKey)
  let result = await tryFetch(etag)
  if (result.kind === 'notModified') {
    const cached = resolveNotModified(ctx.client, ctx.queryKey, 'Catalog list')
    if (cached !== undefined) {
      return cached
    }
    clearStoredEtag(ctx.queryKey)
    result = await tryFetch(undefined)
  }
  if (result.kind === 'notModified') {
    throw new Error('Catalog list: 304 Not Modified after unconditional retry')
  }
  setStoredEtag(ctx.queryKey, result.etag)
  return result.data
}

async function runCatalogEpisodeQuery(
  ctx: QueryFunctionContext<ReturnType<typeof catalogEpisodeQueryKey>>,
): Promise<CatalogEpisode | null> {
  const id = ctx.queryKey[2]
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Catalog episode query requires an id')
  }

  const tryFetch = async (etag?: string) => fetchCatalogEpisodeById(id, etag)

  let etag = getStoredEtag(ctx.queryKey)
  let result = await tryFetch(etag)
  if (result.kind === 'notModified') {
    const cached = resolveNotModified(ctx.client, ctx.queryKey, 'Catalog episode')
    if (cached !== undefined) {
      return cached
    }
    clearStoredEtag(ctx.queryKey)
    result = await tryFetch(undefined)
  }
  if (result.kind === 'notModified') {
    throw new Error('Catalog episode: 304 Not Modified after unconditional retry')
  }
  if (result.etag) {
    setStoredEtag(ctx.queryKey, result.etag)
  }
  return result.entry
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

export function useCatalogEpisodeQuery(id: string | undefined) {
  return useQuery({
    queryKey: catalogEpisodeQueryKey(id ?? ''),
    queryFn: runCatalogEpisodeQuery,
    staleTime: CATALOG_HTTP_MAX_AGE_MS,
    enabled: typeof id === 'string' && id.length > 0,
  })
}
