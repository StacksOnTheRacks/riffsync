import { useQuery } from '@tanstack/react-query'
import { fetchLobby, fetchRoomsMine } from '../api/roomsApi'
import { ensureGuestSession } from '../session/guestSession'

export function lobbyQueryKey() {
  return ['lobby'] as const
}

export function useLobbyQuery() {
  return useQuery({
    queryKey: lobbyQueryKey(),
    queryFn: () => {
      const { sessionId } = ensureGuestSession('live')
      return fetchLobby(sessionId)
    },
    staleTime: 15_000,
  })
}

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
