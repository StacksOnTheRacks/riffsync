import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import type { HostNextUpItem } from './hostNextUpQueue'

const HOST_EXTENSION_INSTALL_HASH = '#host-extension'

type HostRoomConsoleProps = {
  extensionPresent: boolean
  mediaTabOpen: boolean
  mediaPlaybackControllable: boolean
  captureActive: boolean
  nowPlayingTitle: string
  nextUpItems: HostNextUpItem[]
  onAddCatalog: (episode: CatalogEpisode) => void
  onAddUrl: (url: string) => boolean
  onRemoveNextUp: (id: string) => void
  onOpenMediaTab: () => void
  onStartBroadcast: () => void
  onStopBroadcast: () => void
  onPlay: () => void
  onPause: () => void
  onFastForward: () => void
  transportBusy?: boolean
  consoleError?: string | null
}

export function HostRoomConsole({
  extensionPresent,
  mediaTabOpen,
  mediaPlaybackControllable,
  captureActive,
  nowPlayingTitle,
  nextUpItems,
  onAddCatalog,
  onAddUrl,
  onRemoveNextUp,
  onOpenMediaTab,
  onStartBroadcast,
  onStopBroadcast,
  onPlay,
  onPause,
  onFastForward,
  transportBusy = false,
  consoleError = null,
}: HostRoomConsoleProps) {
  const [urlDraft, setUrlDraft] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [catalogQuery, setCatalogQuery] = useState('')
  const catalogQueryResult = useCatalogListQuery()

  const filteredCatalog = useMemo(() => {
    const catalogEntries = catalogQueryResult.data ?? []
    const q = catalogQuery.trim().toLowerCase()
    if (!q) return catalogEntries
    return catalogEntries.filter((ep) => ep.title.toLowerCase().includes(q))
  }, [catalogQueryResult.data, catalogQuery])

  const statusLabel = captureActive ? 'Now Playing' : 'Ready'
  const canFastForward = nextUpItems.length > 0 && !transportBusy

  const submitUrl = () => {
    setUrlError(null)
    if (!urlDraft.trim()) return
    const ok = onAddUrl(urlDraft)
    if (!ok) {
      setUrlError('Enter an absolute http(s) URL.')
      return
    }
    setUrlDraft('')
  }

  if (!extensionPresent) {
    return (
      <div className="riffsync-host-console riffsync-host-console--no-ext">
        <Link
          className="gen-button gen-button-wide"
          to={`/how-to-host-a-watchparty${HOST_EXTENSION_INSTALL_HASH}`}
        >
          Install Host Extension
        </Link>
        <Link
          className="gen-button gen-button-wide"
          to="/how-to-host-a-watchparty"
          target="_blank"
          rel="noopener noreferrer"
        >
          Hosting Guide
        </Link>
      </div>
    )
  }

  return (
    <div className="riffsync-host-console">
      {!mediaTabOpen ? (
        <button
          type="button"
          className="gen-button gen-button-wide"
          disabled={transportBusy}
          onClick={onOpenMediaTab}
        >
          Open Media Source Tab
        </button>
      ) : captureActive ? (
        <button
          type="button"
          className="gen-button gen-button-wide"
          disabled={transportBusy}
          onClick={onStopBroadcast}
        >
          Stop Broadcasting
        </button>
      ) : (
        <button
          type="button"
          className="gen-button gen-button-wide"
          disabled={transportBusy}
          onClick={onStartBroadcast}
        >
          Start Broadcasting
        </button>
      )}

      <div className="riffsync-host-console__now" aria-live="polite">
        <div className="riffsync-host-console__now-label">{statusLabel}</div>
        <div className="riffsync-host-console__now-title">{nowPlayingTitle}</div>
        {mediaTabOpen ? (
          <div className="riffsync-host-console__transport" role="group" aria-label="Playback controls">
            <button
              type="button"
              className="riffsync-host-console__transport-btn"
              aria-label="Play"
              title="Play"
              disabled={!mediaPlaybackControllable || transportBusy}
              onClick={onPlay}
            >
              <PlayIcon />
            </button>
            <button
              type="button"
              className="riffsync-host-console__transport-btn"
              aria-label="Pause"
              title="Pause"
              disabled={!mediaPlaybackControllable || transportBusy}
              onClick={onPause}
            >
              <PauseIcon />
            </button>
            <button
              type="button"
              className="riffsync-host-console__transport-btn"
              aria-label="Play next in queue"
              title="Play next in queue"
              disabled={!canFastForward}
              onClick={onFastForward}
            >
              <FastForwardIcon />
            </button>
          </div>
        ) : null}
      </div>

      {consoleError ? (
        <p className="riffsync-host-console__error" role="alert">
          {consoleError}
        </p>
      ) : null}

      <section className="riffsync-host-console__section" aria-label="Next up">
        <h3 className="riffsync-host-console__heading">Next Up</h3>
        <ul className="riffsync-host-console__queue">
          {nextUpItems.map((item) => (
            <li key={item.id} className="riffsync-host-console__queue-row">
              {item.kind === 'catalog' ? (
                <>
                  {item.posterImageUrl ? (
                    <img
                      src={item.posterImageUrl}
                      alt=""
                      className="riffsync-host-console__poster"
                    />
                  ) : (
                    <span className="riffsync-host-console__poster riffsync-host-console__poster--empty" />
                  )}
                  <span className="riffsync-host-console__queue-title">{item.title}</span>
                </>
              ) : (
                <span className="riffsync-host-console__queue-title">{item.label}</span>
              )}
              <button
                type="button"
                className="riffsync-host-console__icon-btn"
                aria-label={`Remove ${item.kind === 'catalog' ? item.title : item.label}`}
                onClick={() => onRemoveNextUp(item.id)}
              >
                ×
              </button>
            </li>
          ))}
          <li className="riffsync-host-console__queue-row riffsync-host-console__queue-row--composer">
            <input
              type="url"
              className="riffsync-host-console__url-input"
              placeholder="Paste URL..."
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitUrl()
                }
              }}
            />
            <button
              type="button"
              className="riffsync-host-console__icon-btn"
              aria-label="Add URL to next up"
              onClick={submitUrl}
            >
              +
            </button>
          </li>
        </ul>
        {urlError ? (
          <p className="riffsync-host-console__error" role="alert">
            {urlError}
          </p>
        ) : null}
      </section>

      <section className="riffsync-host-console__section" aria-label="Catalog">
        <div className="riffsync-host-console__catalog-head">
          <h3 className="riffsync-host-console__heading">Catalog</h3>
          <input
            type="search"
            className="riffsync-host-console__search"
            placeholder="Search..."
            value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            aria-label="Search catalog"
          />
        </div>
        {catalogQueryResult.isPending ? (
          <p className="riffsync-muted">Loading catalog…</p>
        ) : catalogQueryResult.isError ? (
          <p className="riffsync-host-console__error" role="alert">
            Could not load catalog.
            <button type="button" className="gen-button" onClick={() => void catalogQueryResult.refetch()}>
              Retry
            </button>
          </p>
        ) : (
          <ul className="riffsync-host-console__catalog-list">
            {filteredCatalog.map((ep) => (
              <li key={ep.id} className="riffsync-host-console__catalog-row">
                {ep.posterImageUrl ? (
                  <img src={ep.posterImageUrl} alt="" className="riffsync-host-console__poster" />
                ) : (
                  <span className="riffsync-host-console__poster riffsync-host-console__poster--empty" />
                )}
                <span className="riffsync-host-console__queue-title">{ep.title}</span>
                <button
                  type="button"
                  className="riffsync-host-console__icon-btn"
                  aria-label={`Add ${ep.title} to next up`}
                  onClick={() => onAddCatalog(ep)}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="riffsync-host-console__svg">
      <path d="M8 5.5v13l11-6.5L8 5.5Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="riffsync-host-console__svg">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function FastForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="riffsync-host-console__svg">
      <path d="M4 6v12l8-6L4 6Z" fill="currentColor" />
      <path d="M12 6v12l8-6-8-6Z" fill="currentColor" />
    </svg>
  )
}

export { HOST_EXTENSION_INSTALL_HASH }
