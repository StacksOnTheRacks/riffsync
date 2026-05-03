import { Link, useParams } from 'react-router-dom'
import { SoloYouTubePlayer } from '../components/watch/SoloYouTubePlayer'
import { PlaybackExpectationBadge } from '../components/watch/PlaybackExpectationBadge'
import { useCatalogEpisodeQuery } from '../catalog/useCatalogQuery'

export function SoloWatchPage() {
  const { catalogEpisodeId } = useParams<{ catalogEpisodeId: string }>()
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
        <p>No catalog row matched <code>{catalogEpisodeId ?? '—'}</code>.</p>
        <p>
          <Link to="/catalog">Browse catalog</Link>
        </p>
      </div>
    )
  }

  const vid = episode.youtubeVideoId
  const canEmbed = episode.embedAllows !== false

  return (
    <div className="container riffsync-solo-watch">
      <nav className="riffsync-solo-watch__crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden> · </span>
        <Link to="/catalog">Catalog</Link>
        <span aria-hidden> · </span>
        <span>Experiment #{episode.experimentNumber}</span>
      </nav>
      <header className="riffsync-solo-watch__header">
        <h1>{episode.title}</h1>
        <p className="riffsync-solo-watch__meta">
          <span>Experiment {episode.experimentNumber}</span>
          <span aria-hidden> · </span>
          <span>{episode.era}</span>
          <span aria-hidden> · </span>
          <PlaybackExpectationBadge expectation={episode.playbackExpectation} />
        </p>
        {episode.tagline?.trim() && <p className="riffsync-solo-watch__tagline">{episode.tagline}</p>}
      </header>
      {!vid && (
        <p role="status">Playback unavailable — no YouTube video is linked for this catalog entry.</p>
      )}
      {vid && !canEmbed && (
        <p role="alert">
          This episode is not available for in-app playback ({' '}
          <code>embedAllows</code>
          ). Open on YouTube if you have a watch URL.
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
      {vid && canEmbed && <SoloYouTubePlayer videoId={vid} titleHint={episode.title} />}
      <p className="riffsync-solo-watch__fineprint">
        Official YouTube embed only. Ads and Premium benefits are not verified by RiffSync — see{' '}
        <Link to="/catalog">catalog</Link> for more episodes.
      </p>
    </div>
  )
}
