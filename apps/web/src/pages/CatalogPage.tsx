import { Link, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import { CatalogLoadErrorPanel } from '../components/catalog/CatalogLoadErrorPanel'
import { CatalogFilterBar } from '../components/catalog/CatalogFilterBar'
import { CatalogHubEntryLinks } from '../components/catalog/CatalogHubEntryLinks'
import { useResumePendingPartyRoom } from '../catalog/useResumePendingPartyRoom'
import { catalogCardImageUrl, catalogEntriesWithYoutubeLink } from '../catalog/mockCatalog'
import { filterCatalogEntries } from '../catalog/filterCatalogEntries'
import { PlaybackExpectationBadge } from '../components/watch/PlaybackExpectationBadge'
import { EpisodeTileActions } from '../components/catalog/EpisodeTileActions'
import { formatCatalogEraLabel, type CatalogEpisode } from '../catalog/catalogTypes'

function CatalogGridCard({ episode }: { episode: CatalogEpisode }) {
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

export function CatalogPage() {
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useCatalogListQuery()
  const [titleQuery, setTitleQuery] = useState('')

  useResumePendingPartyRoom(data, navigate)

  const allEntries = data ?? []
  const youtubeEntries = useMemo(
    () => catalogEntriesWithYoutubeLink(allEntries),
    [allEntries],
  )
  const filteredEntries = useMemo(
    () => filterCatalogEntries(youtubeEntries, { titleQuery, eras: [] }),
    [youtubeEntries, titleQuery],
  )

  const filterBarDisabled = isPending && !data
  const isFilterNoMatch = youtubeEntries.length > 0 && filteredEntries.length === 0

  if (isPending && !data) {
    return (
      <div className="container">
        <h1>Catalog</h1>
        <p>Loading…</p>
      </div>
    )
  }

  if (isError && !data) {
    return (
      <div className="container">
        <CatalogLoadErrorPanel
          error={error}
          onRetry={() => {
            void refetch()
          }}
          homeLink
        />
      </div>
    )
  }

  return (
    <div className="container riffsync-catalog-page">
      <h1>Catalog</h1>
      <p className="riffsync-catalog-page__lede">Push the button, Frank</p>
      <CatalogHubEntryLinks />
      <CatalogFilterBar
        titleQuery={titleQuery}
        onTitleQueryChange={setTitleQuery}
        disabled={filterBarDisabled}
        showEraChips={false}
      />
      <div className="riffsync-catalog-grid">
        {filteredEntries.map((ep) => (
          <CatalogGridCard key={ep.id} episode={ep} />
        ))}
      </div>
      {youtubeEntries.length === 0 && (
        <p>
          {allEntries.length === 0
            ? 'No episodes in the catalog yet.'
            : 'No episodes with a YouTube link are listed yet.'}
        </p>
      )}
      {isFilterNoMatch && (
        <div className="riffsync-catalog-no-match">
          <p>No episodes match your filters.</p>
          <p className="riffsync-catalog-no-match-hint">Clear the search field to see all episodes.</p>
        </div>
      )}
      <p>
        <Link to="/">← Home</Link>
      </p>
    </div>
  )
}
