import { Link } from 'react-router-dom'
import { catalogCardImageUrl } from '../../catalog/mockCatalog'
import { formatCatalogLabel, type CatalogEpisode } from '../../catalog/catalogTypes'
import { EpisodeTileActions } from './EpisodeTileActions'

export function CatalogGridCard({ episode }: { episode: CatalogEpisode }) {
  const img = catalogCardImageUrl(episode)
  const labels = episode.labels.length > 0 ? episode.labels : [formatCatalogLabel(episode.catalog)]
  return (
    <article className="riffsync-catalog-card movie type-movie status-publish has-post-thumbnail hentry">
      <div className="gen-carousel-movies-style-3 movie-grid style-3">
        <div className="gen-movie-contain">
          <div className="gen-movie-img">
            <img src={img} alt={episode.title} loading="lazy" />
          </div>
          <EpisodeTileActions episode={episode} />
          <div className="gen-info-contain">
            <div className="gen-movie-info">
              <h3>
                <Link to={`/watch/${episode.id}`}>{episode.title}</Link>
              </h3>
            </div>
            <div className="gen-movie-meta-holder">
              <ul>
                <li>#{episode.experimentNumber}</li>
                {labels.map((label) => (
                  <li key={label}>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>
            {episode.tags.length > 0 && (
              <div className="riffsync-catalog-card__advisory">
                {episode.tags.map((tag) => (
                  <span key={tag} className="riffsync-catalog-card__tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
