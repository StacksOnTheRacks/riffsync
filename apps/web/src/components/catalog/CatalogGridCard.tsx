import { Link } from 'react-router-dom'
import { catalogCardImageUrl } from '../../catalog/mockCatalog'
import { formatCatalogEraLabel, type CatalogEpisode } from '../../catalog/catalogTypes'
import { PlaybackExpectationBadge } from '../watch/PlaybackExpectationBadge'
import { EpisodeTileActions } from './EpisodeTileActions'

export function CatalogGridCard({ episode }: { episode: CatalogEpisode }) {
  const img = catalogCardImageUrl(episode)
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
                <li>
                  <span>{formatCatalogEraLabel(episode.era)}</span>
                </li>
              </ul>
              <div className="riffsync-catalog-card__advisory">
                <PlaybackExpectationBadge expectation={episode.playbackExpectation} />
              </div>
              {episode.embedAllows === false && (
                <p className="riffsync-catalog-card__embed" role="status">
                  Not embeddable in-app — use YouTube directly if available.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
