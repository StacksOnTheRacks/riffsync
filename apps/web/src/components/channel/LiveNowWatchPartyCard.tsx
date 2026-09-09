import { Link } from 'react-router-dom'
import type { LobbyRoomRow } from '../../api/roomsApi'
import {
  formatWatchPartyActivity,
  watchPartyHeadline,
  watchPartyRoomPath,
} from '../../live/watchPartyActivity'
import { LIVE_NOW_CHANNEL_AVATAR_URL } from './channelSurfaceConfig'

export function LiveNowWatchPartyCard({
  room,
  posterUrl,
}: {
  room: LobbyRoomRow
  posterUrl?: string | null
}) {
  const headline = watchPartyHeadline(room)
  const roomPath = watchPartyRoomPath(room.roomId)
  const activity = formatWatchPartyActivity(room.lastActivityAt)
  const live = room.liveConnectionCount ?? 0
  const imageUrl = posterUrl?.trim() || LIVE_NOW_CHANNEL_AVATAR_URL

  return (
    <article className="riffsync-live-now-card riffsync-live-now-card--party">
      <Link to={roomPath} className="riffsync-live-now-card__poster-link">
        <img src={imageUrl} alt={headline} loading="lazy" className="riffsync-live-now-card__poster" />
      </Link>
      <div className="riffsync-live-now-card__body">
        <h3 className="riffsync-live-now-card__title">
          <Link to={roomPath}>{headline}</Link>
        </h3>
        <p className="riffsync-live-now-card__tagline">Hosted by {room.hostDisplayName}</p>
        <p className="riffsync-live-now-card__stats">
          {activity ? <span>{activity}</span> : null}
          <span title="Open WebSocket tabs or devices">
            {live} live {live === 1 ? 'connection' : 'connections'}
          </span>
        </p>
      </div>
    </article>
  )
}
