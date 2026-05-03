import { Link } from 'react-router-dom'
import type { CatalogEpisode } from '../../catalog/catalogTypes'
import { catalogCardImageUrl } from '../../catalog/mockCatalog'

const eraLabel = (era: string) => era.replace(/^./, (c) => c.toUpperCase())

export function HomeMovieCard({ episode }: { episode: CatalogEpisode }) {
  const img = catalogCardImageUrl(episode)
  return (
    <div className="movie type-movie status-publish has-post-thumbnail hentry movie_genre-action movie_genre-adventure movie_genre-drama">
      <div className="gen-carousel-movies-style-3 movie-grid style-3">
        <div className="gen-movie-contain">
          <div className="gen-movie-img">
            <img src={img} alt="" loading="lazy" />
            <div className="gen-movie-action">
              <Link to="/catalog" className="gen-button" aria-label={`Open catalog for ${episode.title}`}>
                <i className="fa fa-play" aria-hidden />
              </Link>
            </div>
          </div>
          <div className="gen-info-contain">
            <div className="gen-movie-info">
              <h3>
                <Link to="/catalog">{episode.title}</Link>
              </h3>
            </div>
            <div className="gen-movie-meta-holder">
              <ul>
                <li>#{episode.experimentNumber}</li>
                <li>
                  <Link to="/catalog">
                    <span>{eraLabel(episode.era)}</span>
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
