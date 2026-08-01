import { useQuery } from '@tanstack/react-query'
import { fetchLiveChannel, fetchLiveChannels } from '../api/liveApi'

export function liveChannelQueryKey(slug: string) {
  return ['live-channel', slug] as const
}

export function liveChannelsQueryKey() {
  return ['live-channels'] as const
}

export function useLiveChannelsQuery(enabled = true) {
  return useQuery({
    queryKey: liveChannelsQueryKey(),
    queryFn: fetchLiveChannels,
    enabled,
    staleTime: 30_000,
  })
}

export function useLiveChannelQuery(slug: string | undefined) {
  return useQuery({
    queryKey: liveChannelQueryKey(slug ?? ''),
    queryFn: () => fetchLiveChannel(slug!),
    enabled: Boolean(slug),
    staleTime: 30_000,
  })
}
