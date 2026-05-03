import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LobbyResponse } from '../api/roomsApi'
import { fetchLobby, roomPlaybackForBadge } from '../api/roomsApi'
import { ensureGuestSession } from '../session/guestSession'
import { PlaybackExpectationBadge } from '../components/watch/PlaybackExpectationBadge'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

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
  const staleMs = data?.staleRoomMsHint

  return (
    <div className="container riffsync-lobby-page">
      <h1>Lobby</h1>
      <p className="riffsync-lobby-page__lede">
        Public parties from the deployed API. Guests join anonymously; hosts sign in before creating a room from the{' '}
        <Link to="/catalog">catalog</Link>.
      </p>
      {typeof staleMs === 'number' && (
        <p className="riffsync-muted" role="note">
          Inactive listings may expire after roughly {Math.round(staleMs / 60_000)} minutes server-side — refresh to see updates.
        </p>
      )}
      {!data ? (
        <p>Loading lobby…</p>
      ) : rooms.length === 0 ? (
        <p>No public parties right now. Start one from the catalog when signed in as a host.</p>
      ) : (
        <ul className="riffsync-lobby-list">
          {rooms.map((row) => {
            const title = row.catalog?.title ?? row.catalogEpisodeId
            const poster = row.catalog?.posterImageUrl
            const badge = roomPlaybackForBadge(row.playbackExpectation)
            return (
              <li key={row.roomId} className="riffsync-lobby-list__item">
                {poster ? (
                  <img className="riffsync-lobby-list__poster" src={poster} alt="" loading="lazy" />
                ) : null}
                <div>
                  <h2>
                    <Link to={`/room/${encodeURIComponent(row.roomId)}`}>{title}</Link>
                  </h2>
                  <p className="riffsync-lobby-list__meta">
                    Room <code>{row.roomId.slice(0, 8)}…</code>
                    {' · '}Experiment{' '}
                    {row.catalog?.experimentNumber ?? <span title={row.catalogEpisodeId}>—</span>}
                  </p>
                  <PlaybackExpectationBadge expectation={badge} />
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
