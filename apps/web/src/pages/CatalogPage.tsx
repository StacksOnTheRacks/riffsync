import { Link } from 'react-router-dom'
import { useCatalogEntriesQuery } from '../catalog/useCatalogQuery'
import { catalogCardImageUrl } from '../catalog/mockCatalog'
import { PlaybackExpectationBadge } from '../components/watch/PlaybackExpectationBadge'
import type { CatalogEpisode } from '../catalog/catalogTypes'

const eraLabel = (era: string) => era.replace(/^./, (c) => c.toUpperCase())

function CatalogGridCard({ episode }: { episode: CatalogEpisode }) {
  const img = catalogCardImageUrl(episode)
  return (
    <article className="riffsync-catalog-card movie type-movie status-publish has-post-thumbnail hentry">
      <div className="gen-carousel-movies-style-3 movie-grid style-3">
        <div className="gen-movie-contain">
          <div className="gen-movie-img">
            <img src={img} alt="" loading="lazy" />
            <div className="gen-movie-action">
              <Link
                to={`/watch/${episode.id}`}
                className="gen-button"
                aria-label={`Watch ${episode.title}`}
              >
                <i className="fa fa-play" aria-hidden />
              </Link>
            </div>
          </div>
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
                  <span>{eraLabel(episode.era)}</span>
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

export function CatalogPage() {
  const { data, isPending, isError, error } = useCatalogEntriesQuery()

  if (isPending) {
    return (
      <div className="container">
        <h1>Catalog</h1>
        <p>Loading…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="container" role="alert">
        <h1>Catalog</h1>
        <p>{error instanceof Error ? error.message : 'Could not load catalog'}</p>
        <p>
          <Link to="/">← Home</Link>
        </p>
      </div>
    )
  }

  const entries = data ?? []

  return (
    <div className="container riffsync-catalog-page">
      <h1>Catalog</h1>
      <p className="riffsync-catalog-page__lede">
        Browse experiments anonymously — pick a title to watch solo with the official YouTube player (
        <Link to="/">home</Link>
        ).
      </p>
      <div className="riffsync-catalog-grid">
        {entries.map((ep) => (
          <CatalogGridCard key={ep.id} episode={ep} />
        ))}
      </div>
      {entries.length === 0 && <p>No episodes in the catalog yet.</p>}
      <p>
        <Link to="/">← Home</Link>
      </p>
    </div>
  )
}
