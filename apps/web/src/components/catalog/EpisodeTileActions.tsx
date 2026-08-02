import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { episodeIsPlayableInApp } from '../../catalog/catalogPlayback'
import {
  episodeAllowsInAppEmbed,
  openCatalogYoutubeWatch,
  resolveCatalogYoutubeWatchUrl,
} from '../../catalog/catalogYoutubePlayback'
import { catalogToRoomPlayback, createRoom } from '../../api/roomsApi'
import { getFanAccessToken } from '../../auth/fanTokens'
import { startFanHostedUiSignIn } from '../../auth/fanHostedUiPkce'
import { PENDING_PARTY_EPISODE_KEY } from '../../catalog/pendingPartyStorage'

function resolveExternalSoloWatchUrl(episode: CatalogEpisode): string | null {
  if (episode.playbackHost === 'custom') return null
  if (episodeAllowsInAppEmbed(episode)) return null
  return resolveCatalogYoutubeWatchUrl(episode)
}

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
  const playable = episodeIsPlayableInApp(episode)
  const externalSoloWatchUrl = playable ? resolveExternalSoloWatchUrl(episode) : null

  const startParty = async () => {
    if (!token || !playable) return
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
    if (!playable) return
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
      {playable ? (
        externalSoloWatchUrl ? (
          <button
            type="button"
            className="gen-button gen-button--ghost"
            onClick={() => openCatalogYoutubeWatch(externalSoloWatchUrl)}
          >
            Watch Solo
          </button>
        ) : (
          <Link to={`/watch/${episode.id}`} className="gen-button gen-button--ghost">
            Watch Solo
          </Link>
        )
      ) : (
        <button type="button" className="gen-button gen-button--ghost" disabled>
          Watch Solo
        </button>
      )}
      <button
        type="button"
        className="gen-button"
        disabled={!playable}
        onClick={playable ? (token ? () => void startParty() : signInThenStartParty) : undefined}
      >
        Start Party
      </button>
    </div>
  )
}
