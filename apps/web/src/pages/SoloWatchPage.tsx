import { useEffect } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { SoloCustomIframePlayer } from '../components/watch/SoloCustomIframePlayer'
import { SoloYouTubePlayer } from '../components/watch/SoloYouTubePlayer'
import { useCatalogEpisodeQuery } from '../catalog/catalogQueries'
import { EPISODE_UNAVAILABLE_MESSAGE, formatCatalogUserError } from '../catalog/catalogLoadError'
import {
  episodeAllowsInAppEmbed,
  resolveCatalogYoutubeWatchUrl,
} from '../catalog/catalogYoutubePlayback'
import { SITE_DOCUMENT_TITLE, trimTabTitleSegment } from '../config/documentTitle'
import { getLivePathForEpisodeId } from '../live/liveChannels'

export function SoloWatchPage() {
  const { catalogEpisodeId } = useParams<{ catalogEpisodeId: string }>()
  const [searchParams] = useSearchParams()
  const partyCapture = searchParams.get('partyCapture') === '1'

  const { data: episode, isPending, isError, error, refetch } = useCatalogEpisodeQuery(catalogEpisodeId)

  const externalYoutubeUrl =
    !partyCapture &&
    episode &&
    episode.playbackHost !== 'custom' &&
    !episodeAllowsInAppEmbed(episode)
      ? resolveCatalogYoutubeWatchUrl(episode)
      : null

  useEffect(() => {
    if (!partyCapture) {
      return
    }

    const prev = document.title
    let next: string
    if (!catalogEpisodeId) {
      next = `Watch · ${SITE_DOCUMENT_TITLE}`
    } else if (isPending) {
      next = `Share this tab · loading… · ${SITE_DOCUMENT_TITLE}`
    } else if (isError) {
      const hint = catalogEpisodeId ? trimTabTitleSegment(catalogEpisodeId, 28) : 'error'
      next = `Share this tab · ${hint} · ${SITE_DOCUMENT_TITLE}`
    } else if (!episode) {
      next = `Share this tab · not found · ${SITE_DOCUMENT_TITLE}`
    } else {
      const label = trimTabTitleSegment(episode.title)
      next = `Share this tab · ${label} · ${SITE_DOCUMENT_TITLE}`
    }
    document.title = next
    return () => {
      document.title = prev
    }
  }, [catalogEpisodeId, episode, isError, isPending, partyCapture])

  useEffect(() => {
    if (!externalYoutubeUrl) return
    window.location.replace(externalYoutubeUrl)
  }, [externalYoutubeUrl])

  if (externalYoutubeUrl) {
    return (
      <div className="container riffsync-solo-watch">
        <p role="status">Opening on YouTube…</p>
      </div>
    )
  }

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

  const livePath = !partyCapture && episode.catalog === 'live' ? getLivePathForEpisodeId(episode.id) : undefined
  if (livePath) {
    return <Navigate to={livePath} replace />
  }

  const playbackHost = episode.playbackHost === 'custom' ? 'custom' : 'youtube'
  const customPlaybackUrl = episode.customPlaybackUrl?.trim() ?? ''
  const hasCustomPlaybackUrl =
    playbackHost === 'custom' && customPlaybackUrl.startsWith('https://')
  const vid = episode.youtubeVideoId
  const canEmbed = episodeAllowsInAppEmbed(episode)
  const backdropImageUrl = episode.backdropImageUrl?.trim()
  const pageRoot =
    backdropImageUrl
      ? `riffsync-solo-watch-page riffsync-solo-watch-page--backdrop${partyCapture ? ' riffsync-solo-watch-page--party-capture' : ''}`
      : `riffsync-solo-watch-page${partyCapture ? ' riffsync-solo-watch-page--party-capture' : ''}`
  const innerChrome = partyCapture ? 'riffsync-solo-watch riffsync-solo-watch--capture' : 'container riffsync-solo-watch'
  const youtubePlaybackBlocked = playbackHost === 'youtube' && (!vid || !canEmbed)
  const customPlaybackBlocked = playbackHost === 'custom' && !hasCustomPlaybackUrl

  return (
    <div className={pageRoot}>
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
      {customPlaybackBlocked ? (
        <div className={innerChrome}>
          <p role="status">
            Playback unavailable — no custom playback URL is linked for this catalog entry.
          </p>
        </div>
      ) : null}
      {youtubePlaybackBlocked ? (
        <div className={innerChrome}>
          {!vid && (
            <p role="status">Playback unavailable — no YouTube video is linked for this catalog entry.</p>
          )}
          {vid && !canEmbed && (
            <p role="alert">
              This episode is not available for in-app playback. Open on YouTube if you have a watch URL.
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
      {hasCustomPlaybackUrl ? (
        <div className="riffsync-solo-watch__player-shell">
          <SoloCustomIframePlayer
            key={customPlaybackUrl}
            customPlaybackUrl={customPlaybackUrl}
            title={episode.title}
          />
        </div>
      ) : null}
      {playbackHost === 'youtube' && vid && canEmbed ? (
        <div className="riffsync-solo-watch__player-shell">
          <SoloYouTubePlayer
            videoId={vid}
            titleHint={episode.title}
            autoPlay={false}
            watchUrl={episode.youtubeWatchUrl}
          />
        </div>
      ) : null}
    </div>
  )
}
