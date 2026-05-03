import { useQuery } from '@tanstack/react-query'
import { fetchCatalogEntries, fetchCatalogEpisodeById } from './catalogApi'

export const catalogEntriesQueryKey = ['catalog', 'entries'] as const

export function useCatalogEntriesQuery() {
  return useQuery({
    queryKey: catalogEntriesQueryKey,
    queryFn: fetchCatalogEntries,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCatalogEpisodeQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['catalog', 'entry', id],
    queryFn: () => fetchCatalogEpisodeById(id!),
    staleTime: 1000 * 60 * 5,
    enabled: typeof id === 'string' && id.length > 0,
  })
}
