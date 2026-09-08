import { Link } from 'react-router-dom'
import { catalogCardImageUrl } from '../../catalog/mockCatalog'
import { formatCatalogLabel, type CatalogEpisode } from '../../catalog/catalogTypes'
import { EpisodeTileActions } from '../catalog/EpisodeTileActions'

export function ChannelMovieCard({ episode }: { episode: CatalogEpisode }) {
  const img = catalogCardImageUrl(episode)
  const labels = episode.labels.length > 0 ? episode.labels : [formatCatalogLabel(episode.catalog)]
  const logline =
    episode.tagline?.trim() ||
    `Experiment #${episode.experimentNumber}`

  return (
    <article className="riffsync-channel-movie-card">
      <Link to={`/watch/${episode.id}`} className="riffsync-channel-movie-card__poster-link">
        <img
          src={img}
          alt={episode.title}
          loading="lazy"
          className="riffsync-channel-movie-card__poster"
        />
      </Link>
      <div className="riffsync-channel-movie-card__body">
        <h3 className="riffsync-channel-movie-card__title">
          <Link to={`/watch/${episode.id}`}>{episode.title}</Link>
        </h3>
        <p className="riffsync-channel-movie-card__logline">{logline}</p>
        <div className="riffsync-channel-movie-card__tags">
          {labels.map((label) => (
            <span key={label} className="riffsync-channel-movie-card__tag">
              {label}
            </span>
          ))}
        </div>
        <EpisodeTileActions episode={episode} />
      </div>
    </article>
  )
}
