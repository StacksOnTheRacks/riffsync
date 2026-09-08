import { useCallback, useEffect, useState } from 'react'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'
import { useFanSession } from '../auth/useFanSession'
import { fetchRoomsMine, type MineRoomRow } from '../api/roomsApi'
import { ChannelHero } from '../components/channel/ChannelHero'
import { WatchPartyCard } from '../components/your-parties/WatchPartyCard'
import {
  YOUR_PARTIES_AVATAR_URL,
  YOUR_PARTIES_COVER_URL,
  YOUR_PARTIES_HEADING,
} from '../components/your-parties/yourPartiesAssets'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function YourPartiesPage() {
  const { fanToken } = useFanSession()
  const [rooms, setRooms] = useState<MineRoomRow[]>([])
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  const loadRooms = useCallback(async (token: string) => {
    setLoadState('loading')
    setStatusMessage('Loading parties.')
    try {
      const response = await fetchRoomsMine(token)
      setRooms(response.rooms)
      setLoadState('ready')
      setStatusMessage('')
    } catch {
      setRooms([])
      setLoadState('error')
      setStatusMessage("Couldn't load your parties")
    }
  }, [])

  useEffect(() => {
    if (!fanToken) {
      void startFanHostedUiSignIn('/your-parties').catch(console.error)
      return
    }
    void loadRooms(fanToken)
  }, [fanToken, loadRooms])

  useEffect(() => {
    if (!copyMessage) return
    const timer = window.setTimeout(() => setCopyMessage(''), 2000)
    return () => window.clearTimeout(timer)
  }, [copyMessage])

  if (!fanToken) {
    return (
      <div className="riffsync-your-parties-page riffsync-your-parties-page--signed-out">
        <p role="status">Redirecting to sign in…</p>
      </div>
    )
  }

  const partyCountLabel = `${rooms.length} ${rooms.length === 1 ? 'Party' : 'Parties'}`
  const isLoading = loadState === 'loading' || loadState === 'idle'
  const isError = loadState === 'error'

  return (
    <div className="riffsync-your-parties-page">
      <ChannelHero
        coverUrl={YOUR_PARTIES_COVER_URL}
        avatarUrl={YOUR_PARTIES_AVATAR_URL}
        visualTitle={YOUR_PARTIES_HEADING}
        visualTitleAs="h1"
        subtitle={partyCountLabel}
      />
      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage}
        {copyMessage}
      </div>
      {isError ? (
        <div className="riffsync-your-parties-page__error">
          <p>Couldn&apos;t load your parties</p>
          <button
            type="button"
            className="gen-button riffsync-your-parties-page__retry"
            onClick={() => {
              if (fanToken) void loadRooms(fanToken)
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      <section
        className="riffsync-your-parties-page__cards"
        aria-busy={isLoading ? 'true' : undefined}
        aria-label="Your watch parties"
      >
        {!isLoading && rooms.length === 0 ? (
          <p className="riffsync-your-parties-page__empty">You don&apos;t host any parties yet.</p>
        ) : null}
        {!isLoading
          ? rooms.map((room) => (
              <WatchPartyCard
                key={room.roomId}
                roomId={room.roomId}
                displayTitle={room.displayTitle}
                onCopyUrl={() => setCopyMessage('Copied')}
              />
            ))
          : null}
      </section>
    </div>
  )
}
