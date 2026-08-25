import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchFanProfile } from '../api/fanProfileApi'
import type { LiveChannelSnapshot } from '../api/liveApi'
import { useFanSession } from '../auth/useFanSession'
import { SoloYouTubePlayer } from '../components/watch/SoloYouTubePlayer'
import { getPublicWsUrl } from '../config/wsUrl'
import { useLiveChannelQuery } from '../live/liveQueries'
import { useLiveChannelChat } from '../live/useLiveChannelChat'
import { trackGaEvent } from '../config/googleAnalytics'
import { RoomPageSidebar } from '../room/RoomPageSidebar'
import { useRoomProfileTab } from '../room/useRoomProfileTab'
import { useChatLogStickToBottom } from '../room/useChatLogStickToBottom'
import { useRoomChrome } from '../room/useRoomChrome'
import type { RoomSidebarTab } from '../room/roomPageTypes'
import type { ParticipantAvController } from '../room/sfu/participantAvSession'
import { ensureGuestSession, setGuestDisplayName } from '../session/guestSession'

const LIVE_EMPTY_MAP = new Map()
const LIVE_PARTICIPANT_AV_CONTROLLER: ParticipantAvController = {
  getState: () => ({
    cameraEnabled: false,
    micEnabled: false,
    micMuted: false,
    canPublish: false,
    needsProducerToken: false,
    error: null,
    busy: false,
  }),
  getLocalPreviewStream: () => null,
  subscribe: () => () => {},
  refreshPublishGate: () => {},
  attachSession: () => {},
  resetOnReconnect: () => {},
  teardownPublishing: () => {},
  enableCamera: async () => {},
  disableCamera: () => {},
  enableMic: async () => {},
  disableMic: () => {},
  toggleMicMute: () => {},
  failPublish: () => {},
  clearError: () => {},
}

export function LiveChannelPage() {
  const { slug: slugParam } = useParams<{ slug: string }>()
  const slug = slugParam ? decodeURIComponent(slugParam) : ''
  const { setNowPlayingLabel } = useRoomChrome()

  const guest = ensureGuestSession('live')
  const [sessionId] = useState(guest.sessionId)
  const [displayName, setDisplayName] = useState(guest.displayName)
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)
  const { fanToken } = useFanSession()

  const channelQuery = useLiveChannelQuery(slug || undefined)
  const channel = channelQuery.data ?? null
  const loading = Boolean(slug) && channelQuery.isPending
  const loadError = !slug
    ? 'Live channel not found'
    : channelQuery.isError
      ? channelQuery.error instanceof Error
        ? channelQuery.error.message
        : 'Live channel unavailable'
      : null

  const pageTitle = channel?.title ?? 'Live'

  useEffect(() => {
    if (loadError || loading) {
      setNowPlayingLabel(null)
      return
    }
    setNowPlayingLabel(pageTitle)
    return () => setNowPlayingLabel(null)
  }, [loadError, loading, pageTitle, setNowPlayingLabel])

  useEffect(() => {
    if (!fanToken) return
    let cancelled = false
    void fetchFanProfile(fanToken)
      .then((profile) => {
        if (cancelled) return
        const nextDisplayName = profile.displayName?.trim()
        if (nextDisplayName) {
          setDisplayName(setGuestDisplayName(nextDisplayName))
        }
        setMyAvatarUrl(profile.avatarUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [fanToken])

  return (
    <div className="riffsync-live-page">
      <div className="container riffsync-live-page__inner">
        <h1 className="sr-only">{pageTitle}</h1>

        {loading ? (
          <p className="riffsync-live-page__status" role="status">
            Loading live channel…
          </p>
        ) : null}
        {loadError ? (
          <p className="riffsync-live-page__status" role="alert">
            {loadError}
          </p>
        ) : null}

        {!loading && !loadError && channel ? (
          <LiveChannelReady
            key={channel.roomId}
            slug={slug}
            channel={channel}
            sessionId={sessionId}
            displayName={displayName}
            setDisplayName={setDisplayName}
            myAvatarUrl={myAvatarUrl}
            setMyAvatarUrl={setMyAvatarUrl}
            fanToken={fanToken}
          />
        ) : null}
      </div>
    </div>
  )
}

function LiveChannelReady(props: {
  slug: string
  channel: LiveChannelSnapshot
  sessionId: string
  displayName: string
  setDisplayName: (name: string) => void
  myAvatarUrl: string | null
  setMyAvatarUrl: (url: string | null) => void
  fanToken: string | null
}) {
  const { slug, channel, sessionId, displayName, setDisplayName, myAvatarUrl, setMyAvatarUrl, fanToken } = props
  const chatInputRef = useRef<HTMLInputElement>(null)
  const castToTvButtonRef = useRef<HTMLButtonElement>(null)
  const liveViewGaFiredRef = useRef(false)
  const [roomSidebarTab, setRoomSidebarTab] = useState<RoomSidebarTab>('chat')
  const chat = useLiveChannelChat({
    roomId: channel.roomId,
    sessionId,
    displayName,
    fanToken,
    enabled: true,
  })

  useEffect(() => {
    if (liveViewGaFiredRef.current) return
    liveViewGaFiredRef.current = true
    trackGaEvent('live_channel_view', {
      is_authenticated: Boolean(fanToken),
      entry_surface: 'live',
      source: 'direct',
    })
  }, [fanToken])

  const { logRef: chatLogRef, showJumpToLatest, jumpToLatestLabel, jumpToLatest } =
    useChatLogStickToBottom(chat.chat.length, true, channel.roomId)
  const activeSidebarTab =
    !fanToken && (roomSidebarTab === 'profile' || roomSidebarTab === 'friends')
      ? 'chat'
      : roomSidebarTab === 'room'
        ? 'chat'
        : roomSidebarTab
  const profile = useRoomProfileTab({
    fanToken,
    roomSidebarTab: activeSidebarTab,
    displayName,
    setDisplayName,
    setMyAvatarUrl,
  })

  const canPlay =
    Boolean(channel.youtubeVideoId) && channel.embedAllows !== false && channel.playbackHost !== 'custom'

  return (
    <div className="riffsync-live-page__layout">
      <section className="riffsync-live-page__stage" aria-label="Live video">
        {canPlay && channel.youtubeVideoId ? (
          <SoloYouTubePlayer
            videoId={channel.youtubeVideoId}
            titleHint={channel.title}
            autoPlay
            watchUrl={channel.youtubeWatchUrl}
          />
        ) : (
          <p className="riffsync-live-page__status" role="status">
            Playback unavailable for this live channel.
            {channel.youtubeWatchUrl ? (
              <>
                {' '}
                <a href={channel.youtubeWatchUrl} rel="noreferrer" target="_blank">
                  Open on YouTube
                </a>
              </>
            ) : null}
          </p>
        )}
      </section>

      <RoomPageSidebar
        variant="live"
        className="riffsync-live-page__chat"
        signInReturnPath={`/live/${encodeURIComponent(slug)}`}
        wsBase={getPublicWsUrl()}
        fanToken={fanToken}
        roomId={channel.roomId}
        sessionId={sessionId}
        myAvatarUrl={myAvatarUrl}
        activeSidebarTab={activeSidebarTab}
        setRoomSidebarTab={setRoomSidebarTab}
        viewerCount={chat.presenceCount}
        chat={chat.chat}
        chatReactions={chat.chatReactions}
        remoteTyping={chat.remoteTyping}
        chatMemberLabels={chat.chatMemberLabels}
        chatDraft={chat.chatDraft}
        setChatDraft={chat.setChatDraft}
        notifyComposeBlur={chat.onComposeBlur}
        chatLogRef={chatLogRef}
        chatInputRef={chatInputRef}
        showJumpToLatest={showJumpToLatest}
        jumpToLatestLabel={jumpToLatestLabel}
        jumpToLatest={jumpToLatest}
        chatDrawerBanner={null}
        chatComposeStatus={{ message: null, disableSubmit: chat.chatDraft.trim() === '' }}
        sendChat={chat.sendChat}
        sendChatGif={chat.sendChatGif}
        toggleChatReaction={chat.toggleChatReaction}
        peopleShown={chat.presenceMembers}
        participantProducerBySessionId={LIVE_EMPTY_MAP}
        speakingBySessionId={LIVE_EMPTY_MAP}
        isPublisher={false}
        shareHint={null}
        onCopyShare={() => {}}
        onOpenRenameModal={() => {}}
        roomVisibility="private"
        visibilityBusy={false}
        visibilityErr={null}
        onSelectRoomVisibility={() => {}}
        avDisabled
        participantAvController={LIVE_PARTICIPANT_AV_CONTROLLER}
        announceRoomA11y={() => {}}
        profileDraft={profile.profileDraft}
        setProfileDraft={profile.setProfileDraft}
        profileSaveErr={profile.profileSaveErr}
        profileSaving={profile.profileSaving}
        profileAvatarUrl={profile.profileAvatarUrl}
        profileAvatarLoading={profile.profileAvatarLoading}
        profileAvatarUploading={profile.profileAvatarUploading}
        profileAvatarErr={profile.profileAvatarErr}
        profileAvatarInputRef={profile.profileAvatarInputRef}
        saveProfileDisplayName={profile.saveProfileDisplayName}
        onProfileAvatarSelected={profile.onProfileAvatarSelected}
        castAvailability="unavailable"
        castStartLifecycle="idle"
        onCastToTvClick={() => {}}
        castToTvButtonRef={castToTvButtonRef}
        linkTvPanelOpen={false}
        linkTvActive={false}
        onLinkTvClick={() => {}}
        onLinkTvClose={() => {}}
        onLinkTvSubmitCode={async () => {}}
        onStopLinkTv={() => {}}
        linkTvButtonRef={castToTvButtonRef}
      />
    </div>
  )
}
