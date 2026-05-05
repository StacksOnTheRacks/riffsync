import { Link } from 'react-router-dom'
import { formatCatalogEraLabel, type CatalogEpisode } from '../../catalog/catalogTypes'
import { catalogCardImageUrl } from '../../catalog/mockCatalog'
import { EpisodeTileActions } from '../../components/catalog/EpisodeTileActions'

export function HomeMovieCard({ episode }: { episode: CatalogEpisode }) {
  const img = catalogCardImageUrl(episode)
  return (
    <div className="movie type-movie status-publish has-post-thumbnail hentry movie_genre-action movie_genre-adventure movie_genre-drama">
      <div className="gen-carousel-movies-style-3 movie-grid style-3">
        <div className="gen-movie-contain">
          <div className="gen-movie-img">
            <img src={img} alt="" loading="lazy" />
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
                  <Link to={`/watch/${episode.id}`}>
                    <span>{formatCatalogEraLabel(episode.era)}</span>
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
