import { useEffect, useState } from 'react'
import { startFanHostedUiSignIn } from '../auth/fanHostedUiPkce'
import { useFanSession } from '../auth/useFanSession'
import { useRoomsMineQuery } from '../api/roomsQueries'
import { ChannelHero } from '../components/channel/ChannelHero'
import { WatchPartyCard } from '../components/your-parties/WatchPartyCard'
import {
  YOUR_PARTIES_AVATAR_URL,
  YOUR_PARTIES_COVER_URL,
  YOUR_PARTIES_HEADING,
} from '../components/your-parties/yourPartiesAssets'

export function YourPartiesPage() {
  const { fanToken } = useFanSession()
  const { data, isPending, isError, refetch, isFetching } = useRoomsMineQuery(fanToken)
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    if (!fanToken) {
      void startFanHostedUiSignIn('/your-parties').catch(console.error)
    }
  }, [fanToken])

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

  const rooms = data?.rooms ?? []
  const partyCountLabel = `${rooms.length} ${rooms.length === 1 ? 'Party' : 'Parties'}`
  const isLoading = isPending || (isFetching && !data)
  const statusMessage = isLoading
    ? 'Loading parties.'
    : isError
      ? "Couldn't load your parties"
      : ''

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
              void refetch()
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
