import { Link } from 'react-router-dom'
import type { LiveChannelSnapshot } from '../../api/liveApi'
import { liveChannelCardImageUrl } from '../../live/liveChannels'

export function LiveNowChannelCard({ channel }: { channel: LiveChannelSnapshot }) {
  const tagline = channel.tagline?.trim() || 'Watch live on RiffSync with room chat.'

  return (
    <article className="riffsync-live-now-card">
      <Link to={channel.path} className="riffsync-live-now-card__poster-link">
        <img
          src={liveChannelCardImageUrl(channel)}
          alt={channel.title}
          loading="lazy"
          className="riffsync-live-now-card__poster"
        />
      </Link>
      <div className="riffsync-live-now-card__body">
        <h3 className="riffsync-live-now-card__title">
          <Link to={channel.path}>{channel.title}</Link>
        </h3>
        <p className="riffsync-live-now-card__tagline">{tagline}</p>
      </div>
    </article>
  )
}
