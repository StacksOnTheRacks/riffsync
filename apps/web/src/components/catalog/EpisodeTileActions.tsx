import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { catalogToRoomPlayback, createRoom } from '../../api/roomsApi'
import { getFanAccessToken } from '../../auth/fanTokens'
import { startFanHostedUiSignIn } from '../../auth/fanHostedUiPkce'
import { PENDING_PARTY_EPISODE_KEY } from '../../catalog/pendingPartyStorage'
import {
  episodeAllowsInAppEmbed,
  openCatalogYoutubeWatch,
  resolveCatalogYoutubeWatchUrl,
} from '../../catalog/catalogYoutubePlayback'

export function EpisodeTileActions({
  episode,
  layout = 'stack',
}: {
  episode: CatalogEpisode
  /** Wide banners use a horizontal button row; grid tiles stack. */
  layout?: 'stack' | 'inline'
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const token = getFanAccessToken()
  const returnPath = `${location.pathname}${location.search}` || '/'
  const directYoutubeWatchUrl = episodeAllowsInAppEmbed(episode) ? null : resolveCatalogYoutubeWatchUrl(episode)

  const startParty = async () => {
    if (!token) return
    try {
      const room = await createRoom(token, {
        catalogEpisodeId: episode.id,
        playbackExpectation: catalogToRoomPlayback(episode),
        visibility: 'public',
      })
      navigate(`/room/${encodeURIComponent(room.roomId)}`)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not create room')
    }
  }

  const signInThenStartParty = () => {
    sessionStorage.setItem(PENDING_PARTY_EPISODE_KEY, episode.id)
    void startFanHostedUiSignIn(returnPath)
  }

  return (
    <div
      className={
        layout === 'inline'
          ? 'riffsync-episode-tile-actions riffsync-episode-tile-actions--inline'
          : 'riffsync-episode-tile-actions'
      }
    >
      {directYoutubeWatchUrl ? (
        <button
          type="button"
          className="gen-button gen-button--ghost"
          onClick={() => openCatalogYoutubeWatch(directYoutubeWatchUrl)}
        >
          Watch Solo
        </button>
      ) : (
        <Link to={`/watch/${episode.id}`} className="gen-button gen-button--ghost">
          Watch Solo
        </Link>
      )}
      <button type="button" className="gen-button" onClick={token ? () => void startParty() : signInThenStartParty}>
        Start Party
      </button>
    </div>
  )
}
