import { useMemo, useState } from 'react'
import { ChannelHero } from '../components/channel/ChannelHero'
import {
  LIVE_NOW_CHANNEL_AVATAR_URL,
  LIVE_NOW_CHANNEL_COVER_URL,
  LIVE_NOW_CHANNEL_VISUAL_TITLE,
} from '../components/channel/channelSurfaceConfig'
import { LiveNowChannelCard } from '../components/channel/LiveNowChannelCard'
import { LiveNowChannelListRow } from '../components/channel/LiveNowChannelListRow'
import { ViewToggle, type ChannelViewMode } from '../components/channel/ViewToggle'
import { useLiveChannelsQuery } from '../live/liveQueries'

export function LiveNowPage() {
  const { data, isPending, isError, error, refetch } = useLiveChannelsQuery()
  const [view, setView] = useState<ChannelViewMode>('cards')
  const enabledChannels = useMemo(
    () => (data?.channels ?? []).filter((channel) => channel.enabled),
    [data],
  )

  if (isPending && !data) {
    return (
      <div className="riffsync-channel-layout riffsync-live-now-page">
        <h1 className="sr-only">Live Now</h1>
        <ChannelHero
          coverUrl={LIVE_NOW_CHANNEL_COVER_URL}
          avatarUrl={LIVE_NOW_CHANNEL_AVATAR_URL}
          visualTitle={LIVE_NOW_CHANNEL_VISUAL_TITLE}
          subtitle="Official live channels on RiffSync"
        />
        <section className="riffsync-channel-layout__body">
          <div className="container">
            <p>Loading live channels…</p>
          </div>
        </section>
      </div>
    )
  }

  if (isError && !data) {
    const message = error instanceof Error ? error.message : 'Live channels unavailable'
    return (
      <div className="riffsync-channel-layout riffsync-live-now-page">
        <h1 className="sr-only">Live Now</h1>
        <ChannelHero
          coverUrl={LIVE_NOW_CHANNEL_COVER_URL}
          avatarUrl={LIVE_NOW_CHANNEL_AVATAR_URL}
          visualTitle={LIVE_NOW_CHANNEL_VISUAL_TITLE}
          subtitle="Official live channels on RiffSync"
        />
        <section className="riffsync-channel-layout__body">
          <div className="container">
            <div role="alert">
              <p>{message}</p>
              <p>
                <button type="button" className="gen-button" onClick={() => void refetch()}>
                  Retry
                </button>
              </p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="riffsync-channel-layout riffsync-live-now-page">
      <h1 className="sr-only">Live Now</h1>
      <ChannelHero
        coverUrl={LIVE_NOW_CHANNEL_COVER_URL}
        avatarUrl={LIVE_NOW_CHANNEL_AVATAR_URL}
        visualTitle={LIVE_NOW_CHANNEL_VISUAL_TITLE}
        subtitle="Official live channels on RiffSync"
      />
      <section className="riffsync-channel-layout__body">
        <div className="container riffsync-channel-layout__container">
          <div className="riffsync-channel-layout__toolbar">
            <ViewToggle view={view} onViewChange={setView} />
          </div>
          {enabledChannels.length === 0 ? (
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
        </div>
      </section>
    </div>
  )
}
