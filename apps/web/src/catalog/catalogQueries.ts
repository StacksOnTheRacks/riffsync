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

function resolveNotModified<T>(
  ctx: QueryFunctionContext<readonly unknown[], unknown>,
  label: string,
): T {
  const cached = ctx.client.getQueryData<T>(ctx.queryKey)
  if (cached === undefined) {
    throw new Error(`${label}: 304 Not Modified without cached data`)
  }
  return cached
}

async function runCatalogListQuery(
  ctx: QueryFunctionContext<readonly ['catalog', 'list', string]>,
  fetcher: (etag?: string) => Promise<CatalogFetchResult<CatalogEpisode[]>>,
): Promise<CatalogEpisode[]> {
  const etag = getStoredEtag(ctx.queryKey)
  const result = await fetcher(etag)
  if (result.kind === 'notModified') {
    return resolveNotModified(ctx, 'Catalog list')
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
  const etag = getStoredEtag(ctx.queryKey)
  const result: CatalogEpisodeByIdResult = await fetchCatalogEpisodeById(id, etag)
  if (result.kind === 'notModified') {
    return resolveNotModified(ctx, 'Catalog episode')
  }
  if (result.etag) {
    setStoredEtag(ctx.queryKey, result.etag)
  }
  return result.entry
}

export function invalidatePublicCatalogQueries(queryClient: QueryClient): Promise<void> {
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
