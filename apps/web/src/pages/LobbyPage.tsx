import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LiveChannelSnapshot } from '../api/liveApi'
import { fetchLiveChannels } from '../api/liveApi'
import type { LobbyResponse } from '../api/roomsApi'
import { fetchLobby } from '../api/roomsApi'
import { ensureGuestSession } from '../session/guestSession'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

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
  const [liveChannels, setLiveChannels] = useState<LiveChannelSnapshot[]>([])
  const [fetchErr, setFetchErr] = useState<string | null>(null)

  useEffect(() => {
    if (!apiUrl) return
    const { sessionId } = ensureGuestSession('lobby')
    void fetchLobby(sessionId)
      .then(setData)
      .catch((e: unknown) =>
        setFetchErr(e instanceof Error ? e.message : 'Lobby request failed'),
      )
    void fetchLiveChannels()
      .then((live) => {
        setLiveChannels(live.channels.filter((channel) => channel.enabled))
      })
      .catch(() => setLiveChannels([]))
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

  return (
    <div className="container riffsync-lobby-page">
      <h1>Lobby</h1>
      <div className="riffsync-lobby-columns">
        <section className="riffsync-lobby-live" aria-labelledby="riffsync-lobby-live-heading">
          <h2 id="riffsync-lobby-live-heading" className="riffsync-lobby-section-title">
            Live now
          </h2>
          {liveChannels.length > 0 ? (
            <ul className="riffsync-lobby-list">
              {liveChannels.map((channel) => (
                <li key={channel.slug} className="riffsync-lobby-list__item riffsync-lobby-list__item--live">
                  <div className="riffsync-lobby-list__body">
                    <h3 className="riffsync-lobby-list__title">
                      <span className="riffsync-lobby-list__live-dot" aria-label="Live" />
                      <Link to={channel.path}>{channel.title}</Link>
                    </h3>
                    <p className="riffsync-lobby-list__host riffsync-muted">
                      {channel.tagline?.trim() || 'Watch live on RiffSync with room chat.'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="riffsync-muted">No live channels right now.</p>
          )}
        </section>

        <section className="riffsync-lobby-parties" aria-labelledby="riffsync-lobby-parties-heading">
          <h2 id="riffsync-lobby-parties-heading" className="riffsync-lobby-section-title">
            Watch parties
          </h2>
          {!data ? (
            <p>Loading lobby…</p>
          ) : rooms.length === 0 ? (
            <p>There are no public rooms right now.</p>
          ) : (
            <ul className="riffsync-lobby-list">
              {rooms.map((row) => {
                const headline = row.displayTitle ?? row.catalogEpisodeId
                const activity = formatLobbyActivity(row.lastActivityAt)
                const live = row.liveConnectionCount ?? 0
                return (
                  <li key={row.roomId} className="riffsync-lobby-list__item">
                    <div className="riffsync-lobby-list__body">
                      <h3 className="riffsync-lobby-list__title">
                        <Link to={`/room/${encodeURIComponent(row.roomId)}`}>{headline}</Link>
                      </h3>
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
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
