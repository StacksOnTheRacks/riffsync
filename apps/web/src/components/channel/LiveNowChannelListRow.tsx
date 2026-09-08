import { Link } from 'react-router-dom'
import type { LiveChannelSnapshot } from '../../api/liveApi'
import { LIVE_NOW_CHANNEL_AVATAR_URL } from './channelSurfaceConfig'

function liveChannelPosterUrl(channel: LiveChannelSnapshot): string {
  return channel.posterImageUrl?.trim() || channel.backdropImageUrl?.trim() || LIVE_NOW_CHANNEL_AVATAR_URL
}

export function LiveNowChannelListRow({ channel }: { channel: LiveChannelSnapshot }) {
  const tagline = channel.tagline?.trim() || 'Watch live on RiffSync with room chat.'

  return (
    <article className="riffsync-live-now-list-row">
      <Link to={channel.path} className="riffsync-live-now-list-row__poster-link">
        <img
          src={liveChannelPosterUrl(channel)}
          alt={channel.title}
          loading="lazy"
          className="riffsync-live-now-list-row__poster"
        />
      </Link>
      <div className="riffsync-live-now-list-row__meta">
        <h3 className="riffsync-live-now-list-row__title">
          <Link to={channel.path}>{channel.title}</Link>
        </h3>
        <p className="riffsync-live-now-list-row__tagline">{tagline}</p>
      </div>
    </article>
  )
}
