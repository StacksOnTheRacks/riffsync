import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LobbyResponse } from '../api/roomsApi'
import { fetchLobby, roomPlaybackForBadge } from '../api/roomsApi'
import { ensureGuestSession } from '../session/guestSession'
import { PlaybackExpectationBadge } from '../components/watch/PlaybackExpectationBadge'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import { LIVE_CHANNELS } from '../live/liveChannels'

function formatLobbyActivity(lastActivityAt: number | undefined): string {
  if (typeof lastActivityAt !== 'number' || !Number.isFinite(lastActivityAt)) return ''
  const sec = Math.max(0, Math.floor((Date.now() - lastActivityAt) / 1000))
  if (sec < 45) return 'Active just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `Active ${min}m ago`
  const hr = Math.floor(min / 60)
  return `Active ${hr}h ago`
}

export function LobbyPage() {
  const apiUrl = getPublicApiBaseUrl()
  const [data, setData] = useState<LobbyResponse | null>(null)
  const [fetchErr, setFetchErr] = useState<string | null>(null)

  useEffect(() => {
    if (!apiUrl) return
    const { sessionId } = ensureGuestSession('lobby')
    void fetchLobby(sessionId)
      .then(setData)
      .catch((e: unknown) =>
        setFetchErr(e instanceof Error ? e.message : 'Lobby request failed'),
      )
  }, [apiUrl])

  if (!apiUrl) {
    return (
      <div className="container" role="alert">
        <h1>Lobby</h1>
        <p>Configure VITE_PUBLIC_API_BASE_URL to load the lobby.</p>
        <p>
          <Link to="/">← Home</Link>
        </p>
      </div>
    )
  }

  if (fetchErr) {
    return (
      <div className="container" role="alert">
        <h1>Lobby</h1>
        <p>{fetchErr}</p>
        <p>
          <Link to="/">← Home</Link>
        </p>
      </div>
    )
  }

  const rooms = data?.rooms ?? []
  const liveChannels = LIVE_CHANNELS.filter((channel) => channel.enabled)

  return (
    <div className="container riffsync-lobby-page">
      <h1>Lobby</h1>
      <p className="riffsync-lobby-page__lede">
        Join a public room from the list below. To host, sign in and start a room from the{' '}
        <Link to="/catalog">catalog</Link>.
      </p>
      {liveChannels.length > 0 ? (
        <section className="riffsync-lobby-live" aria-labelledby="riffsync-lobby-live-heading">
          <h2 id="riffsync-lobby-live-heading" className="riffsync-lobby-section-title">
            Live now
          </h2>
          <ul className="riffsync-lobby-list">
            {liveChannels.map((channel) => (
              <li key={channel.slug} className="riffsync-lobby-list__item riffsync-lobby-list__item--live">
                <div className="riffsync-lobby-list__body">
                  <h3 className="riffsync-lobby-list__title">
                    <span className="riffsync-lobby-list__live-dot" aria-label="Live" />
                    <Link to={channel.path}>{channel.defaultTitle}</Link>
                  </h3>
                  <p className="riffsync-lobby-list__host riffsync-muted">{channel.defaultDescription}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!data ? (
        <p>Loading lobby…</p>
      ) : rooms.length === 0 ? (
        <p>There are no public rooms right now.</p>
      ) : (
        <ul className="riffsync-lobby-list">
          {rooms.map((row) => {
            const headline = row.displayTitle ?? row.catalogEpisodeId
            const badge = roomPlaybackForBadge(row.playbackExpectation)
            const activity = formatLobbyActivity(row.lastActivityAt)
            const live = row.liveConnectionCount ?? 0
            return (
              <li key={row.roomId} className="riffsync-lobby-list__item">
                <div className="riffsync-lobby-list__body">
                  <h2 className="riffsync-lobby-list__title">
                    <Link to={`/room/${encodeURIComponent(row.roomId)}`}>{headline}</Link>
                  </h2>
                  <p className="riffsync-lobby-list__host riffsync-muted">
                    Hosted by {row.hostDisplayName}
                  </p>
                  <div className="riffsync-lobby-list__stats">
                    {activity ? (
                      <span className="riffsync-lobby-list__activity riffsync-muted">{activity}</span>
                    ) : null}
                    <span className="riffsync-lobby-list__connections" title="Open WebSocket tabs or devices">
                      {live} live {live === 1 ? 'connection' : 'connections'}
                    </span>
                    <PlaybackExpectationBadge expectation={badge} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p>
        <Link to="/catalog">Browse catalog</Link>
        {' · '}
        <Link to="/">Home</Link>
      </p>
    </div>
  )
}
