import { Link } from 'react-router-dom'
import { catalogCardImageUrl } from '../../catalog/mockCatalog'
import { formatCatalogLabel, type CatalogEpisode } from '../../catalog/catalogTypes'
import { EpisodeTileActions } from '../catalog/EpisodeTileActions'

export function ChannelListRow({ episode }: { episode: CatalogEpisode }) {
  const img = catalogCardImageUrl(episode)
  const labels = episode.labels.length > 0 ? episode.labels : [formatCatalogLabel(episode.catalog)]

  return (
    <article className="riffsync-channel-list-row">
      <Link to={`/watch/${episode.id}`} className="riffsync-channel-list-row__poster-link">
        <img
          src={img}
          alt={episode.title}
          loading="lazy"
          className="riffsync-channel-list-row__poster"
        />
      </Link>
      <div className="riffsync-channel-list-row__meta">
        <h3 className="riffsync-channel-list-row__title">
          <Link to={`/watch/${episode.id}`}>{episode.title}</Link>
        </h3>
        <div className="riffsync-channel-list-row__tags">
          {labels.map((label) => (
            <span key={label} className="riffsync-channel-list-row__tag">
              {label}
            </span>
          ))}
          {episode.tags.map((tag) => (
            <span key={tag} className="riffsync-channel-list-row__tag riffsync-channel-list-row__tag--muted">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <EpisodeTileActions episode={episode} layout="inline" />
    </article>
  )
}
