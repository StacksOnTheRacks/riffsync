import { useQuery } from '@tanstack/react-query'
import { fetchRoomsMine } from '../api/roomsApi'

export function roomsMineQueryKey(fanToken: string | null | undefined) {
  return ['rooms-mine', fanToken ?? ''] as const
}

export function useRoomsMineQuery(fanToken: string | null | undefined) {
  return useQuery({
    queryKey: roomsMineQueryKey(fanToken),
    queryFn: () => fetchRoomsMine(fanToken!),
    enabled: Boolean(fanToken),
    staleTime: 30_000,
  })
}
