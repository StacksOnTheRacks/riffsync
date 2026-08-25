import { useEffect } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { CatalogEpisode } from './catalogTypes'
import { PENDING_PARTY_EPISODE_KEY } from './pendingPartyStorage'
import { catalogToRoomPlayback, createRoom } from '../api/roomsApi'
import { trackGaEvent } from '../config/googleAnalytics'
import { getFanAccessToken } from '../auth/fanTokens'

async function resumePending(
  episodes: CatalogEpisode[],
  navigate: NavigateFunction,
): Promise<void> {
  const pending = sessionStorage.getItem(PENDING_PARTY_EPISODE_KEY)
  const token = getFanAccessToken()
  if (!pending || !token) return
  const ep = episodes.find((e) => e.id === pending)
  sessionStorage.removeItem(PENDING_PARTY_EPISODE_KEY)
  if (!ep) return
  try {
    const room = await createRoom(token, {
      catalogEpisodeId: ep.id,
      playbackExpectation: catalogToRoomPlayback(ep),
      visibility: 'public',
    })
    trackGaEvent('host_room_create', {
      catalog_category: ep.catalog,
      playback_host: ep.playbackHost === 'custom' ? 'custom' : 'youtube',
      is_authenticated: true,
      entry_surface: 'catalog',
      source: 'direct',
    })
    navigate(`/room/${encodeURIComponent(room.roomId)}`, { replace: true })
  } catch (e) {
    window.alert(e instanceof Error ? e.message : 'Could not create room')
  }
}

/** After Hosted UI sign-in, create the party room for `PENDING_PARTY_EPISODE_KEY` if set. */
export function useResumePendingPartyRoom(episodes: CatalogEpisode[] | undefined, navigate: NavigateFunction) {
  useEffect(() => {
    if (!episodes?.length) return
    void resumePending(episodes, navigate)
  }, [episodes, navigate])
}
