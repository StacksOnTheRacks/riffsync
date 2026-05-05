import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useCatalogEntriesQuery } from '../catalog/useCatalogQuery'
import { catalogCardImageUrl, catalogEntriesWithYoutubeLink } from '../catalog/mockCatalog'
import { PlaybackExpectationBadge } from '../components/watch/PlaybackExpectationBadge'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { catalogToRoomPlayback, createRoom } from '../api/roomsApi'
import { getFanAccessToken } from '../auth/fanTokens'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'

const PENDING_PARTY = 'riffsync.pendingPartyEpisodeId'

const eraLabel = (era: string) => era.replace(/^./, (c) => c.toUpperCase())

function CatalogPartyActions({ episode }: { episode: CatalogEpisode }) {
  const navigate = useNavigate()
  const token = getFanAccessToken()

  const start = async () => {
    if (!token) return
    try {
      const room = await createRoom(token, {
        catalogEpisodeId: episode.id,
        playbackExpectation: catalogToRoomPlayback(episode),
        visibility: 'public',
      })
      navigate(`/room/${encodeURIComponent(room.roomId)}`)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not create room')
    }
  }

  const signInFirst = () => {
    sessionStorage.setItem(PENDING_PARTY, episode.id)
    void startFanHostedUiSignIn('/catalog')
  }

  return (
    <div className="riffsync-catalog-card__party">
      {token ? (
        <button type="button" className="gen-button" onClick={() => void start()}>
          Start party
        </button>
      ) : (
        <button type="button" className="gen-button" onClick={signInFirst}>
          Sign in to host — start party
        </button>
      )}
    </div>
  )
}

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
              <CatalogPartyActions episode={episode} />
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
  const { data, isPending, isError, error } = useCatalogEntriesQuery()

  useEffect(() => {
    const pending = sessionStorage.getItem(PENDING_PARTY)
    const token = getFanAccessToken()
    if (!pending || !data?.length || !token) return
    const ep = data.find((e) => e.id === pending)
    sessionStorage.removeItem(PENDING_PARTY)
    if (!ep) return
    void (async () => {
      try {
        const room = await createRoom(token, {
          catalogEpisodeId: ep.id,
          playbackExpectation: catalogToRoomPlayback(ep),
          visibility: 'public',
        })
        navigate(`/room/${encodeURIComponent(room.roomId)}`, { replace: true })
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Could not create room')
      }
    })()
  }, [data, navigate])

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

  const allEntries = data ?? []
  const entries = catalogEntriesWithYoutubeLink(allEntries)

  return (
    <div className="container riffsync-catalog-page">
      <h1>Catalog</h1>
      <p className="riffsync-catalog-page__lede">Push the button, Frank</p>
      <div className="riffsync-catalog-grid">
        {entries.map((ep) => (
          <CatalogGridCard key={ep.id} episode={ep} />
        ))}
      </div>
      {entries.length === 0 && (
        <p>
          {allEntries.length === 0
            ? 'No episodes in the catalog yet.'
            : 'No episodes with a YouTube link are listed yet.'}
        </p>
      )}
      <p>
        <Link to="/">← Home</Link>
      </p>
    </div>
  )
}
