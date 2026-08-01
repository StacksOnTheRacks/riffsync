import { useQuery } from '@tanstack/react-query'
import { fetchLiveChannel } from '../api/liveApi'
import { getLiveChannelSeed } from './liveChannels'

export function liveChannelQueryKey(slug: string) {
  return ['live-channel', slug] as const
}

export function useLiveChannelQuery(slug: string | undefined) {
  const seed = typeof slug === 'string' ? getLiveChannelSeed(slug) : undefined
  const enabled = Boolean(slug && seed?.enabled)

  return useQuery({
    queryKey: liveChannelQueryKey(slug ?? ''),
    queryFn: () => fetchLiveChannel(slug!),
    enabled,
    staleTime: 30_000,
  })
}
