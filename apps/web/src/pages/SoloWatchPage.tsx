import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { SoloYouTubePlayer } from '../components/watch/SoloYouTubePlayer'
import { useCatalogEpisodeQuery } from '../catalog/catalogQueries'
import { EPISODE_UNAVAILABLE_MESSAGE, formatCatalogUserError } from '../catalog/catalogLoadError'
import { SITE_DOCUMENT_TITLE, trimTabTitleSegment } from '../config/documentTitle'

const PARTY_CAPTURE_ANIMATION = 'riffsyncPartyCaptureBannerFadeOut'

/** Banner for `/watch/:id?partyCapture=1`; keyed by episode so opening another capture tab resets state. */
function PartyCaptureBanner() {
  const [closed, setClosed] = useState(false)

  if (closed) return null

  return (
    <div
      className="riffsync-party-capture-banner riffsync-party-capture-banner--timed"
      role="status"
      onAnimationEnd={(e) => {
        if (e.animationName === PARTY_CAPTURE_ANIMATION) setClosed(true)
      }}
    >
      <div className="riffsync-party-capture-banner__inner">
        <p>
          This tab is meant to be shared with your watch party. Go back to the party tab, start sharing, then{' '}
          <strong>choose this tab</strong> in your browser&apos;s share dialog. Chat stays on the party tab.
        </p>
        <button type="button" onClick={() => setClosed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  )
}


export function SoloWatchPage() {
  const { catalogEpisodeId } = useParams<{ catalogEpisodeId: string }>()
  const [searchParams] = useSearchParams()
  const partyCapture = searchParams.get('partyCapture') === '1'

  const { data: episode, isPending, isError, error, refetch } = useCatalogEpisodeQuery(catalogEpisodeId)

  useEffect(() => {
    const prev = document.title
    let next: string
    if (!catalogEpisodeId) {
      next = `Watch · ${SITE_DOCUMENT_TITLE}`
    } else if (isPending) {
      next = partyCapture
        ? `Share this tab · loading… · ${SITE_DOCUMENT_TITLE}`
        : `Watch · loading… · ${SITE_DOCUMENT_TITLE}`
    } else if (isError) {
      const hint = catalogEpisodeId ? trimTabTitleSegment(catalogEpisodeId, 28) : 'error'
      next = partyCapture
        ? `Share this tab · ${hint} · ${SITE_DOCUMENT_TITLE}`
        : `Watch · ${hint} · ${SITE_DOCUMENT_TITLE}`
    } else if (!episode) {
      next = partyCapture
        ? `Share this tab · not found · ${SITE_DOCUMENT_TITLE}`
        : `Watch · not found · ${SITE_DOCUMENT_TITLE}`
    } else {
      const label = trimTabTitleSegment(episode.title)
      next = partyCapture
        ? `Share this tab · ${label} · ${SITE_DOCUMENT_TITLE}`
        : `Watch · ${label} · ${SITE_DOCUMENT_TITLE}`
    }
    document.title = next
    return () => {
      document.title = prev
    }
  }, [catalogEpisodeId, episode, isError, isPending, partyCapture])

  if (isPending && !episode) {
    if (partyCapture) {
      return (
        <div className="riffsync-solo-watch-page riffsync-solo-watch-page--party-capture">
          <div className="riffsync-solo-watch riffsync-solo-watch--capture">
            <p role="status">Loading playback…</p>
          </div>
        </div>
      )
    }
    return (
      <div className="container riffsync-solo-watch">
        <p>Loading episode…</p>
      </div>
    )
  }

  if (isError && !episode) {
    const message = formatCatalogUserError(error, EPISODE_UNAVAILABLE_MESSAGE)
    if (partyCapture) {
      return (
        <div className="riffsync-solo-watch-page riffsync-solo-watch-page--party-capture" role="alert">
          <div className="riffsync-solo-watch riffsync-solo-watch--capture">
            <p>{message}</p>
            <p>
              <button type="button" className="btn btn-primary" onClick={() => void refetch()}>
                Try again
              </button>
            </p>
            <p>
              <Link to="/">← Home</Link>
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="container riffsync-solo-watch" role="alert">
        <p>{message}</p>
        <p>
          <button type="button" className="btn btn-primary" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
        <p>
          <Link to="/">← Home</Link>
        </p>
      </div>
    )
  }

  if (!episode) {
    if (partyCapture) {
      return (
        <div className="riffsync-solo-watch-page riffsync-solo-watch-page--party-capture">
          <div className="riffsync-solo-watch riffsync-solo-watch--capture">
            <h1 className="sr-only">Not found</h1>
            <p role="alert">
              No catalog row matched <code>{catalogEpisodeId ?? '—'}</code>.
            </p>
            <p>
              <Link to="/catalog">Browse catalog</Link>
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="container riffsync-solo-watch">
        <h1>Not found</h1>
        <p>
          No catalog row matched <code>{catalogEpisodeId ?? '—'}</code>.
        </p>
        <p>
          <Link to="/catalog">Browse catalog</Link>
        </p>
      </div>
    )
  }

  const vid = episode.youtubeVideoId
  const canEmbed = episode.embedAllows !== false
  const backdropImageUrl = episode.backdropImageUrl?.trim()
  const pageRoot =
    backdropImageUrl
      ? `riffsync-solo-watch-page riffsync-solo-watch-page--backdrop${partyCapture ? ' riffsync-solo-watch-page--party-capture' : ''}`
      : `riffsync-solo-watch-page${partyCapture ? ' riffsync-solo-watch-page--party-capture' : ''}`
  const innerChrome = partyCapture ? 'riffsync-solo-watch riffsync-solo-watch--capture' : 'container riffsync-solo-watch'
  const playbackBlocked = !vid || !canEmbed

  return (
    <div className={pageRoot}>
      {partyCapture ? (
        <PartyCaptureBanner key={catalogEpisodeId ?? 'episode'} />
      ) : null}
      {backdropImageUrl ? (
        <div
          className="riffsync-solo-watch-page__backdrop"
          style={{
            backgroundImage: `linear-gradient(
              rgb(13 17 23 / 0.88),
              rgb(13 17 23 / 0.92)
            ), url(${JSON.stringify(backdropImageUrl)})`,
            backgroundSize: 'cover,cover',
            backgroundPosition: 'center,center',
            backgroundRepeat: 'no-repeat,no-repeat',
          }}
          aria-hidden
        />
      ) : null}
      <h1 className="sr-only">{episode.title}</h1>
      {playbackBlocked ? (
        <div className={innerChrome}>
          {!vid && (
            <p role="status">Playback unavailable — no YouTube video is linked for this catalog entry.</p>
          )}
          {vid && !canEmbed && (
            <p role="alert">
              This episode is not available for in-app playback (<code>embedAllows</code>). Open on YouTube if you have a
              watch URL.
              {episode.youtubeWatchUrl && (
                <>
                  {' '}
                  <a href={episode.youtubeWatchUrl} rel="noreferrer" target="_blank">
                    Watch on YouTube
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      ) : null}
      {vid && canEmbed ? (
        <div className="riffsync-solo-watch__player-shell">
          <SoloYouTubePlayer videoId={vid} titleHint={episode.title} autoPlay={false} />
        </div>
      ) : null}
    </div>
  )
}
