import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { SoloYouTubePlayer } from '../components/watch/SoloYouTubePlayer'
import { useCatalogEpisodeQuery } from '../catalog/useCatalogQuery'

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

  const { data: episode, isPending, isError, error } = useCatalogEpisodeQuery(catalogEpisodeId)

  if (isPending) {
    return (
      <div className="container riffsync-solo-watch">
        <p>Loading episode…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="container riffsync-solo-watch" role="alert">
        <p>Could not load this episode.</p>
        <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
        <p>
          <Link to="/">← Home</Link>
        </p>
      </div>
    )
  }

  if (!episode) {
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

  return (
    <div
      className={
        backdropImageUrl
          ? 'riffsync-solo-watch-page riffsync-solo-watch-page--backdrop'
          : 'riffsync-solo-watch-page'
      }
    >
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
      <div className="container riffsync-solo-watch">
        <header className="riffsync-solo-watch__header">
          <h1 className="sr-only">{episode.title}</h1>
          <nav aria-label="Breadcrumb" className="riffsync-solo-watch__toolbar">
            <Link to="/">Home</Link>
            <span aria-hidden> · </span>
            <Link to="/catalog">Catalog</Link>
            <span aria-hidden> · </span>
            <span>Experiment #{episode.experimentNumber}</span>
            <span aria-hidden> · </span>
            <span className="riffsync-solo-watch__toolbar-era">{episode.era}</span>
          </nav>
        </header>
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
      {vid && canEmbed ? (
        <div className="riffsync-solo-watch__player-shell">
          <SoloYouTubePlayer videoId={vid} titleHint={episode.title} autoPlay={false} />
        </div>
      ) : null}
      <div className="container riffsync-solo-watch">
        <p className="riffsync-solo-watch__fineprint">
          Embedded YouTube player. Browse more episodes in the <Link to="/catalog">catalog</Link>.
        </p>
      </div>
    </div>
  )
}
