import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLobbyQuery } from '../api/roomsQueries'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import type { CatalogEpisode } from '../catalog/catalogTypes'
import { ChannelHero } from '../components/channel/ChannelHero'
import { ChannelSectionTabs } from '../components/channel/ChannelSectionTabs'
import { getChannelToolbarTabs } from '../components/channel/channelToolbarTabs'
import {
  LIVE_NOW_CHANNEL_AVATAR_URL,
  LIVE_NOW_CHANNEL_COVER_URL,
  LIVE_NOW_CHANNEL_VISUAL_TITLE,
} from '../components/channel/channelSurfaceConfig'
import { LiveNowChannelCard } from '../components/channel/LiveNowChannelCard'
import { LiveNowChannelListRow } from '../components/channel/LiveNowChannelListRow'
import { LiveNowWatchPartyCard } from '../components/channel/LiveNowWatchPartyCard'
import { LiveNowWatchPartyListRow } from '../components/channel/LiveNowWatchPartyListRow'
import { ViewToggle, type ChannelViewMode } from '../components/channel/ViewToggle'
import { LIVE_NOW_WATCH_PARTIES_PATH } from '../live/liveChannels'
import { useLiveChannelsQuery } from '../live/liveQueries'

function catalogPosterUrl(
  catalog: CatalogEpisode[] | undefined,
  catalogEpisodeId: string,
): string | undefined {
  const episode = catalog?.find((entry) => entry.id === catalogEpisodeId)
  return episode?.posterImageUrl?.trim() || episode?.backdropImageUrl?.trim() || undefined
}

export function LiveNowPage() {
  const { pathname } = useLocation()
  const tabs = getChannelToolbarTabs(pathname)
  const showWatchParties = pathname === LIVE_NOW_WATCH_PARTIES_PATH
  const liveQuery = useLiveChannelsQuery()
  const lobbyQuery = useLobbyQuery()
  const catalogQuery = useCatalogListQuery()
  const [view, setView] = useState<ChannelViewMode>('cards')
  const enabledChannels = useMemo(
    () => (liveQuery.data?.channels ?? []).filter((channel) => channel.enabled),
    [liveQuery.data],
  )
  const rooms = lobbyQuery.data?.rooms ?? []

  const livePending = liveQuery.isPending && !liveQuery.data
  const liveError = liveQuery.isError && !liveQuery.data
  const liveErrorMessage =
    liveQuery.error instanceof Error ? liveQuery.error.message : 'Live channels unavailable'
  const lobbyErrorMessage =
    lobbyQuery.error instanceof Error ? lobbyQuery.error.message : 'Watch parties unavailable'

  return (
    <div className="riffsync-channel-layout riffsync-live-now-page">
      <h1 className="sr-only">Live Now</h1>
      <ChannelHero
        coverUrl={LIVE_NOW_CHANNEL_COVER_URL}
        avatarUrl={LIVE_NOW_CHANNEL_AVATAR_URL}
        avatarVariant="glyph"
        visualTitle={LIVE_NOW_CHANNEL_VISUAL_TITLE}
        subtitle="Official live channels and public watch parties"
        toolbar={
          <>
            <ChannelSectionTabs tabs={tabs} pathname={pathname} />
            <ViewToggle view={view} onViewChange={setView} />
          </>
        }
      />
      <section className="riffsync-channel-layout__body">
        <div className="container riffsync-channel-layout__container">
          {showWatchParties ? (
            <section
              className="riffsync-live-now-page__section"
              aria-labelledby="riffsync-live-now-parties-heading"
              aria-busy={lobbyQuery.isPending && !lobbyQuery.data ? 'true' : undefined}
            >
              <h2 id="riffsync-live-now-parties-heading" className="sr-only">
                Watch parties
              </h2>
              {lobbyQuery.isPending && !lobbyQuery.data ? (
                <p>Loading watch parties…</p>
              ) : lobbyQuery.isError && !lobbyQuery.data ? (
                <div role="alert">
                  <p>{lobbyErrorMessage}</p>
                  <p>
                    <button type="button" className="gen-button" onClick={() => void lobbyQuery.refetch()}>
                      Retry
                    </button>
                  </p>
                </div>
              ) : rooms.length === 0 ? (
                <p className="riffsync-live-now-page__empty">There are no public rooms right now.</p>
              ) : view === 'cards' ? (
                <div className="riffsync-channel-card-grid riffsync-live-now-card-grid">
                  {rooms.map((room) => (
                    <LiveNowWatchPartyCard
                      key={room.roomId}
                      room={room}
                      posterUrl={catalogPosterUrl(catalogQuery.data, room.catalogEpisodeId)}
                    />
                  ))}
                </div>
              ) : (
                <div className="riffsync-channel-list riffsync-live-now-list">
                  {rooms.map((room) => (
                    <LiveNowWatchPartyListRow
                      key={room.roomId}
                      room={room}
                      posterUrl={catalogPosterUrl(catalogQuery.data, room.catalogEpisodeId)}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section
              className="riffsync-live-now-page__section"
              aria-labelledby="riffsync-live-now-channels-heading"
            >
              <h2 id="riffsync-live-now-channels-heading" className="sr-only">
                Streams
              </h2>
              {livePending ? (
                <p>Loading live channels…</p>
              ) : liveError ? (
                <div role="alert">
                  <p>{liveErrorMessage}</p>
                  <p>
                    <button type="button" className="gen-button" onClick={() => void liveQuery.refetch()}>
                      Retry
                    </button>
                  </p>
                </div>
              ) : enabledChannels.length === 0 ? (
                <p className="riffsync-live-now-page__empty">No live channels right now.</p>
              ) : view === 'cards' ? (
                <div className="riffsync-channel-card-grid riffsync-live-now-card-grid">
                  {enabledChannels.map((channel) => (
                    <LiveNowChannelCard key={channel.slug} channel={channel} />
                  ))}
                </div>
              ) : (
                <div className="riffsync-channel-list riffsync-live-now-list">
                  {enabledChannels.map((channel) => (
                    <LiveNowChannelListRow key={channel.slug} channel={channel} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  )
}
