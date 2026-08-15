import { Link, useParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomMode } from '../api/roomsApi'
import { fetchFanProfile } from '../api/fanProfileApi'
import { patchRoom } from '../api/roomsApi'
import { ensureGuestSession, setGuestDisplayName } from '../session/guestSession'
import { getPublicWsUrl } from '../config/wsUrl'
import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import { getPublicOrigin } from '../config/publicOrigin'
import { useChatLogStickToBottom } from '../room/useChatLogStickToBottom'
import { announceWebrtcDebugOnRoomMount } from '../room/webrtcDebug'
import { useViewportWide } from '../room/stage/useViewportWide'
import { HostControlBar } from '../room/HostControlBar'
import {
  avDisabledAnnounceCopy,
  formatHostRoomPatchError,
  mergeRoomPatchResult,
  roomModeAnnounceCopy,
  visibilityAnnounceCopy,
  type RoomVisibility,
} from '../room/hostRoomControls'
import { StageParticipantLayout } from '../room/stage/StageParticipantLayout'
import { enteredVideoChatMode } from '../room/roomMediaLifecycle'
import { useRoomChrome } from '../room/useRoomChrome'
import { useRoomSnapshot } from '../room/useRoomSnapshot'
import { useRoomMediaEngine } from '../room/useRoomMediaEngine'
import { useHostScreenCapture } from '../room/useHostScreenCapture'
import { useRoomProfileTab } from '../room/useRoomProfileTab'
import { RoomPlaybackPanel } from '../room/RoomPlaybackPanel'
import { RoomPageSidebar } from '../room/RoomPageSidebar'
import { RoomRenameModal } from '../room/RoomRenameModal'
import { RIFFSYNC_SFU_CONFIG_ALERT_ID } from '../room/drawerErrorPresentation'
import type { RoomSidebarTab } from '../room/roomPageTypes'
import {
  hostSourceOpensOnYoutube,
  openOrNavigateHostSourceTab,
  resolveHostSourceTabUrl,
} from '../room/hostSourceTab'
import { useCastAvailability } from '../room/cast/useCastAvailability'
import { useCastStartSession } from '../room/cast/useCastStartSession'
import { CastActiveStagePanel } from '../room/cast/CastActiveStagePanel'
import { useLinkTvSession } from '../room/useLinkTvSession'
import type { BuildCastPresentationSnapshotInput } from '../room/cast/buildCastPresentationSnapshot'
import type { TheaterShareQualityPreset } from '../room/theaterShareQuality'
import { useHostExtensionPresence } from '../room/useHostExtensionPresence'
import { useHostNextUpQueue } from '../room/useHostNextUpQueue'
import { useCatalogListQuery } from '../catalog/catalogQueries'
import type { CatalogEpisode } from '../catalog/catalogTypes'

export function RoomPage() {
  const { roomId: roomIdParam } = useParams<{ roomId: string }>()
  const roomId = roomIdParam ? decodeURIComponent(roomIdParam) : ''

  const guestInitial = ensureGuestSession('room')
  const [sessionId] = useState(guestInitial.sessionId)
  const [displayName, setDisplayName] = useState(guestInitial.displayName)
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null)
  const [patchErr, setPatchErr] = useState<string | null>(null)
  const [hostBarBusy, setHostBarBusy] = useState(false)
  const [hostBarErr, setHostBarErr] = useState<string | null>(null)
  const [visibilityBusy, setVisibilityBusy] = useState(false)
  const [visibilityErr, setVisibilityErr] = useState<string | null>(null)
  const [shareHint, setShareHint] = useState<string | null>(null)
  const [roomSidebarTab, setRoomSidebarTab] = useState<RoomSidebarTab>('chat')
  const [expandedView, setExpandedView] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const [renameModalDraft, setRenameModalDraft] = useState('')
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)

  const a11yAnnouncerRef = useRef<HTMLDivElement | null>(null)
  const hostPatchSuppressAnnounceUntilRef = useRef(0)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const prevRoomModeRef = useRef<RoomMode>('theater')

  const wsBase = getPublicWsUrl()
  const apiBaseUrl = getPublicApiBaseUrl()

  const {
    room,
    setRoom,
    roomErr,
    catalogEp,
    canonicalRoomId,
    fanToken,
    isPublisher,
    avDisabled,
    roomMode,
    youtubeVideoId,
  } = useRoomSnapshot(roomId)

  const announceRoomA11y = useCallback((message: string) => {
    const node = a11yAnnouncerRef.current
    if (!node) return
    node.textContent = ''
    node.textContent = message
  }, [])

  const patchHostRoomFields = useCallback(
    async (patch: { roomMode?: RoomMode; avDisabled?: boolean }) => {
      if (!room || !fanToken || !isPublisher || hostBarBusy) return
      const snapshot = room
      setHostBarBusy(true)
      setHostBarErr(null)
      hostPatchSuppressAnnounceUntilRef.current = Date.now() + 3000
      setRoom({
        ...snapshot,
        ...(patch.roomMode !== undefined ? { roomMode: patch.roomMode } : {}),
        ...(patch.avDisabled !== undefined ? { avDisabled: patch.avDisabled } : {}),
      })
      try {
        const res = await patchRoom(fanToken, roomId, patch)
        setRoom((prev) => (prev ? mergeRoomPatchResult(prev, res) : prev))
        if (patch.roomMode !== undefined) {
          announceRoomA11y(roomModeAnnounceCopy(patch.roomMode))
        }
        if (patch.avDisabled !== undefined) {
          announceRoomA11y(avDisabledAnnounceCopy(patch.avDisabled))
        }
      } catch (e) {
        setRoom(snapshot)
        setHostBarErr(formatHostRoomPatchError(e))
      } finally {
        setHostBarBusy(false)
      }
    },
    [room, fanToken, isPublisher, hostBarBusy, roomId, announceRoomA11y, setRoom],
  )

  const patchRoomVisibility = useCallback(
    async (visibility: RoomVisibility) => {
      if (!room || !fanToken || !isPublisher || visibilityBusy || room.visibility === visibility) return
      const snapshot = room
      setVisibilityBusy(true)
      setVisibilityErr(null)
      setRoom({ ...snapshot, visibility })
      try {
        const res = await patchRoom(fanToken, roomId, { visibility })
        setRoom((prev) => (prev ? mergeRoomPatchResult(prev, res) : prev))
        announceRoomA11y(visibilityAnnounceCopy(visibility))
      } catch (e) {
        setRoom(snapshot)
        setVisibilityErr(formatHostRoomPatchError(e))
      } finally {
        setVisibilityBusy(false)
      }
    },
    [room, fanToken, isPublisher, visibilityBusy, roomId, announceRoomA11y, setRoom],
  )

  const {
    sendJson,
    chat,
    chatReactions,
    remoteTyping,
    chatDraft,
    setChatDraft,
    notifyComposeBlur,
    sendChat,
    sendChatGif,
    toggleChatReaction,
    peopleShown,
    participantProducerBySessionId,
    speakingBySessionId,
    chatMemberLabels,
    sfuConfigAlert,
    chatDrawerBanner,
    chatComposeStatus,
    videoRelayStatus,
    theaterAudioStatus,
    guestRemote,
    participantAvController,
    unpublishHostScreen,
    theaterPlaybackSnapshot,
    playGuestVideo,
    playHostCapturePreview,
    bindGuestVideo,
    bindHostCaptureVideo,
    stageParticipantTiles,
    stageLayoutUpdating,
  } = useRoomMediaEngine({
    wsBase,
    canonicalRoomId,
    roomId,
    sessionId,
    displayName,
    fanToken,
    room,
    roomMode,
    isPublisher,
    captureStream,
    captureStreamRef,
    youtubeVideoId,
    announceRoomA11y,
    hostPatchSuppressAnnounceUntilRef,
    setRoom,
  })

  const [theaterShareQuality, setTheaterShareQuality] =
    useState<TheaterShareQualityPreset>('balanced')
  const [hostConsoleBusy, setHostConsoleBusy] = useState(false)
  const [hostConsoleErr, setHostConsoleErr] = useState<string | null>(null)
  const { captureErr, startCapture, stopCapture } = useHostScreenCapture({
    roomId,
    sendJson,
    unpublishHostScreen,
    captureStream,
    setCaptureStream,
    captureStreamRef,
    qualityPreset: theaterShareQuality,
  })

  const hostExtension = useHostExtensionPresence(Boolean(isPublisher))
  const nextUp = useHostNextUpQueue(isPublisher ? roomId : undefined)
  const catalogListQuery = useCatalogListQuery()
  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogEpisode>()
    for (const ep of catalogListQuery.data ?? []) {
      map.set(ep.id, ep)
    }
    return map
  }, [catalogListQuery.data])

  const profile = useRoomProfileTab({
    fanToken,
    roomSidebarTab,
    displayName,
    setDisplayName,
    setMyAvatarUrl,
  })

  useEffect(() => {
    captureStreamRef.current = captureStream
  }, [captureStream])

  useEffect(() => {
    announceWebrtcDebugOnRoomMount()
  }, [])

  useEffect(() => {
    if (!fanToken) return
    let cancelled = false
    void fetchFanProfile(fanToken)
      .then((p) => {
        if (cancelled) return
        const dn = p.displayName?.trim()
        if (dn) {
          const applied = setGuestDisplayName(dn)
          setDisplayName(applied)
        }
        setMyAvatarUrl(p.avatarUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [fanToken])

  useEffect(() => {
    if (!renameModalOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRenameModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [renameModalOpen])

  useEffect(() => {
    const previousMode = prevRoomModeRef.current
    prevRoomModeRef.current = roomMode
    if (!enteredVideoChatMode(previousMode, roomMode)) return
    if (!isPublisher) return
    if (captureStreamRef.current) {
      stopCapture()
      queueMicrotask(() => {
        setRoom((prev) => (prev ? { ...prev, broadcastCaptureActive: false } : prev))
      })
    }
  }, [isPublisher, roomMode, setRoom, stopCapture])

  const activeSidebarTab =
    !fanToken && (roomSidebarTab === 'profile' || roomSidebarTab === 'friends')
      ? 'chat'
      : roomSidebarTab
  const viewportWide = useViewportWide()
  const expandToggleRef = useRef<HTMLButtonElement>(null)
  const castAvailability = useCastAvailability(Boolean(room))
  const { castStartLifecycle, startCast, stopCast, castToTvButtonRef, stopCastButtonRef } =
    useCastStartSession({
      enabled: Boolean(room) && castAvailability === 'available',
      expandedViewActive: expandedView && viewportWide,
      roomMode,
      roomId: canonicalRoomId,
      sessionId,
      apiBaseUrl,
      youtubeVideoId,
      isPublisher,
      hasHostCaptureStream: Boolean(captureStream),
      hasGuestRelayStream: Boolean(guestRemote),
      chat,
      chatMemberLabels,
      stageFocusRestoreRef: expandToggleRef,
    })
  const linkSnapshotInput = useMemo<BuildCastPresentationSnapshotInput>(
    () => ({
      roomMode,
      livePlayback:
        (Boolean(captureStream) || Boolean(guestRemote)) && canonicalRoomId && sessionId
          ? { roomId: canonicalRoomId, sessionId, apiBaseUrl }
          : null,
      youtubeVideoId,
      isPublisher,
      hasHostCaptureStream: Boolean(captureStream),
      hasGuestRelayStream: Boolean(guestRemote),
      chat,
      chatMemberLabels,
    }),
    [
      roomMode,
      captureStream,
      guestRemote,
      canonicalRoomId,
      sessionId,
      apiBaseUrl,
      youtubeVideoId,
      isPublisher,
      chat,
      chatMemberLabels,
    ],
  )
  const {
    linkPanelOpen,
    openLinkPanel,
    closeLinkPanel,
    linkActive,
    claimCode,
    stopLink,
  } = useLinkTvSession({
    enabled: Boolean(room),
    roomId: canonicalRoomId,
    sessionId,
    apiBaseUrl,
    snapshotInput: linkSnapshotInput,
  })
  const linkTvButtonRef = useRef<HTMLButtonElement | null>(null)
  const castStageActive =
    castStartLifecycle === 'casting' || castStartLifecycle === 'stopping' || castStartLifecycle === 'stop_failed'
  const expandedViewActive = expandedView && viewportWide && !castStageActive
  const onCastToTvClick = useCallback(() => {
    if (castStageActive) {
      stopCast()
      return
    }
    void startCast()
  }, [castStageActive, startCast, stopCast])
  const onStopCastClick = useCallback(() => {
    stopCast()
  }, [stopCast])
  const { setExpandedViewActive } = useRoomChrome()

  useEffect(() => {
    setExpandedViewActive(expandedViewActive)
    return () => setExpandedViewActive(false)
  }, [expandedViewActive, setExpandedViewActive])

  const roomChatTabActive = expandedViewActive || activeSidebarTab === 'chat'
  const chatSurfaceKey = `${expandedViewActive ? 'expanded' : 'sidebar'}:${activeSidebarTab}`
  const {
    logRef: chatLogRef,
    showJumpToLatest,
    jumpToLatestLabel,
    jumpToLatest,
  } = useChatLogStickToBottom(chat.length, roomChatTabActive, chatSurfaceKey)

  const avSurfacesEnabled = !avDisabled

  const saveRenameFromModal = async (): Promise<boolean> => {
    if (!room || !fanToken || !isPublisher) return false
    const t = renameModalDraft.trim()
    if (!t) {
      setPatchErr('Room name cannot be empty.')
      return false
    }
    setPatchErr(null)
    try {
      const res = await patchRoom(fanToken, roomId, { displayTitle: t })
      const nextTitle = res.displayTitle ?? t
      setRoom({
        ...room,
        version: res.version,
        catalogEpisodeId: res.catalogEpisodeId,
        youtubeVideoId: res.youtubeVideoId,
        visibility: res.visibility,
        lastActivityAt: res.lastActivityAt,
        displayTitle: nextTitle,
      })
      return true
    } catch (e) {
      setPatchErr(e instanceof Error ? e.message : 'Could not save title')
      return false
    }
  }

  const openRenameModal = () => {
    if (!room) return
    setPatchErr(null)
    setRenameModalDraft(room.displayTitle ?? catalogEp?.title ?? room.catalogEpisodeId ?? '')
    setRenameModalOpen(true)
  }

  const copyShare = async () => {
    const url = `${getPublicOrigin()}/room/${encodeURIComponent(roomId)}`
    try {
      await navigator.clipboard.writeText(url)
      setShareHint('Link copied')
    } catch {
      setShareHint(`Copy manually: ${url}`)
    }
    window.setTimeout(() => setShareHint(null), 4000)
  }

  const openHostMediaTab = hostExtension.openMediaTab

  const openCapturePlayerTab = () => {
    if (!room) return
    const url = resolveHostSourceTabUrl({
      catalogEp,
      catalogEpisodeId: room.catalogEpisodeId,
      origin: getPublicOrigin(),
    })
    if (hostExtension.present) {
      void openHostMediaTab(url).then((state) => {
        if (!state?.ok && state && !state.mediaTabOpen) {
          setHostConsoleErr('Could not open the media tab. Stay on the room tab and try again.')
        } else {
          setHostConsoleErr(null)
        }
      })
      return
    }
    openOrNavigateHostSourceTab(url)
  }

  const openHostMediaViaExtension = useCallback(async (url: string): Promise<boolean> => {
    setHostConsoleBusy(true)
    setHostConsoleErr(null)
    try {
      const state = await openHostMediaTab(url)
      if (!state?.mediaTabOpen) {
        setHostConsoleErr('Could not open the media tab. Stay on the room tab and try again.')
        return false
      }
      return true
    } finally {
      setHostConsoleBusy(false)
    }
  }, [openHostMediaTab])

  const peekNextUp = nextUp.peekNext
  const removeNextUp = nextUp.removeItem

  const skipNextUpItem = useCallback(async () => {
    if (!room || !fanToken || !isPublisher) return
    // Peek only — prune after PATCH + media navigate succeed so failures leave the queue intact.
    const item = peekNextUp()
    if (!item) return
    setHostConsoleErr(null)
    try {
      if (item.kind === 'url') {
        const opened = await openHostMediaViaExtension(item.url)
        if (opened) removeNextUp(item.id)
        return
      }
      setHostConsoleBusy(true)
      const ep = catalogById.get(item.catalogEpisodeId)
      const res = await patchRoom(fanToken, roomId, { catalogEpisodeId: item.catalogEpisodeId })
      setRoom(mergeRoomPatchResult(room, res))
      const url = resolveHostSourceTabUrl({
        catalogEp: ep ?? catalogEp,
        catalogEpisodeId: item.catalogEpisodeId,
        origin: getPublicOrigin(),
      })
      setHostConsoleBusy(false)
      const opened = await openHostMediaViaExtension(url)
      if (opened) removeNextUp(item.id)
    } catch (e) {
      setHostConsoleErr(e instanceof Error ? e.message : 'Could not play next title.')
      setHostConsoleBusy(false)
    }
  }, [
    room,
    fanToken,
    isPublisher,
    peekNextUp,
    removeNextUp,
    catalogById,
    catalogEp,
    roomId,
    setRoom,
    openHostMediaViaExtension,
  ])

  const hostConsoleProps = isPublisher
    ? {
        extensionPresent: hostExtension.present,
        mediaTabOpen: hostExtension.mediaState.mediaTabOpen,
        mediaPlaybackControllable: hostExtension.mediaState.mediaPlaybackControllable,
        captureActive: Boolean(captureStream),
        nowPlayingTitle:
          catalogEp?.title?.trim() ||
          room?.displayTitle?.trim() ||
          room?.catalogEpisodeId ||
          'Untitled',
        nextUpItems: nextUp.items,
        onAddCatalog: (episode: CatalogEpisode) => nextUp.addCatalogEpisode(episode),
        onAddUrl: (url: string) => nextUp.addUrl(url),
        onRemoveNextUp: (id: string) => nextUp.removeItem(id),
        onOpenMediaTab: () => openCapturePlayerTab(),
        onStartBroadcast: () => {
          void startCapture()
        },
        onStopBroadcast: () => {
          stopCapture()
        },
        onPlay: () => {
          void hostExtension.play()
        },
        onPause: () => {
          void hostExtension.pause()
        },
        onFastForward: () => {
          void skipNextUpItem()
        },
        transportBusy: hostConsoleBusy,
        consoleError: hostConsoleErr ?? captureErr,
      }
    : null

  if (!roomId) {
    return (
      <div className="container">
        <p>Missing room id.</p>
      </div>
    )
  }

  if (room === undefined && !roomErr) {
    return (
      <div className="container">
        <p>Loading room…</p>
      </div>
    )
  }

  if (roomErr || !room) {
    return (
      <div className="container" role="alert">
        <h1>Room</h1>
        <p>{roomErr ?? 'Room unavailable.'}</p>
        <p>
          <Link to="/lobby">← Lobby</Link>
        </p>
      </div>
    )
  }

  const backdropImageUrl = catalogEp?.backdropImageUrl?.trim()
  const viewerCount = peopleShown.length
  const roomSidebarProps = {
    wsBase,
    fanToken,
    roomId,
    sessionId,
    myAvatarUrl,
    activeSidebarTab,
    setRoomSidebarTab,
    viewerCount,
    chat,
    chatReactions,
    remoteTyping,
    chatMemberLabels,
    chatDraft,
    setChatDraft,
    notifyComposeBlur,
    chatLogRef,
    chatInputRef,
    showJumpToLatest,
    jumpToLatestLabel,
    jumpToLatest,
    chatDrawerBanner,
    chatComposeStatus,
    sendChat,
    sendChatGif,
    toggleChatReaction,
    peopleShown,
    participantProducerBySessionId,
    speakingBySessionId,
    isPublisher,
    shareHint,
    onCopyShare: () => void copyShare(),
    onOpenRenameModal: openRenameModal,
    roomVisibility: room.visibility,
    visibilityBusy,
    visibilityErr,
    onSelectRoomVisibility: (visibility: RoomVisibility) => void patchRoomVisibility(visibility),
    avDisabled,
    participantAvController,
    announceRoomA11y,
    profileDraft: profile.profileDraft,
    setProfileDraft: profile.setProfileDraft,
    profileSaveErr: profile.profileSaveErr,
    profileSaving: profile.profileSaving,
    profileAvatarUrl: profile.profileAvatarUrl,
    profileAvatarLoading: profile.profileAvatarLoading,
    profileAvatarUploading: profile.profileAvatarUploading,
    profileAvatarErr: profile.profileAvatarErr,
    profileAvatarInputRef: profile.profileAvatarInputRef,
    saveProfileDisplayName: profile.saveProfileDisplayName,
    onProfileAvatarSelected: profile.onProfileAvatarSelected,
    castAvailability,
    castStartLifecycle,
    onCastToTvClick,
    castToTvButtonRef,
    linkTvPanelOpen: linkPanelOpen,
    linkTvActive: linkActive,
    onLinkTvClick: openLinkPanel,
    onLinkTvClose: closeLinkPanel,
    onLinkTvSubmitCode: claimCode,
    onStopLinkTv: stopLink,
    linkTvButtonRef,
    theaterShareQuality,
    onTheaterShareQualityChange: setTheaterShareQuality,
    hostConsole: hostConsoleProps,
  }

  return (
    <div
      className={
        backdropImageUrl ? 'riffsync-room-shell riffsync-room-shell--backdrop' : 'riffsync-room-shell'
      }
    >
      <div id="riffsync-a11y-announcer" ref={a11yAnnouncerRef} aria-live="polite" className="sr-only" />
      {backdropImageUrl ? (
        <div
          className="riffsync-room-shell__backdrop"
          style={{
            backgroundImage: `linear-gradient(
              rgb(13 17 23 / 0.88),
              rgb(13 17 23 / 0.92)
            ), url(${JSON.stringify(backdropImageUrl)})`,
            backgroundSize: 'cover,cover',
            backgroundPosition: 'center,center',
            backgroundRepeat: 'no-repeat,no-repeat',
          }}
          aria-hidden
        />
      ) : null}

      <div className="container riffsync-room-page">
        {sfuConfigAlert ? (
          <p
            id={RIFFSYNC_SFU_CONFIG_ALERT_ID}
            className="riffsync-room-page__host-feedback-alert"
            role="alert"
          >
            {sfuConfigAlert}
          </p>
        ) : null}
        <div
          className={`riffsync-room-page__stage${expandedViewActive ? ' riffsync-room-page__stage--expanded' : ''}`}
          data-expanded-view={expandedViewActive ? 'true' : 'false'}
        >
          <div className={`riffsync-room-page__theater${expandedViewActive ? ' riffsync-room-page__theater--expanded' : ''}`}>
            {viewportWide && !castStageActive ? (
              <button
                ref={expandToggleRef}
                type="button"
                className="riffsync-room-page__expand-toggle"
                aria-pressed={expandedViewActive}
                onClick={() => setExpandedView((value) => !value)}
              >
                {expandedViewActive ? 'Exit expanded view' : 'Expand view'}
              </button>
            ) : null}
            {expandedViewActive ? <RoomPageSidebar presentation="overlay" {...roomSidebarProps} activeSidebarTab="chat" /> : null}
            <StageParticipantLayout
              roomMode={roomMode}
              tiles={stageParticipantTiles}
              layoutUpdating={stageLayoutUpdating}
              viewportWide={viewportWide}
              avSurfacesEnabled={avSurfacesEnabled}
              expandedView={expandedViewActive}
              playback={
                castStageActive ? (
                  <CastActiveStagePanel
                    onStopCast={onStopCastClick}
                    stopCastButtonRef={stopCastButtonRef}
                    stopping={castStartLifecycle === 'stopping'}
                    stopFailed={castStartLifecycle === 'stop_failed'}
                  />
                ) : (
                  <RoomPlaybackPanel
                    isPublisher={isPublisher}
                    captureStream={captureStream}
                    captureErr={captureErr}
                    patchErr={patchErr}
                    renameModalOpen={renameModalOpen}
                    guestRemote={guestRemote}
                    fanToken={fanToken}
                    theaterPlaybackSnapshot={theaterPlaybackSnapshot}
                    videoRelayStatus={videoRelayStatus}
                    theaterAudioStatus={theaterAudioStatus}
                    bindHostCaptureVideo={bindHostCaptureVideo}
                    bindGuestVideo={bindGuestVideo}
                    playHostCapturePreview={playHostCapturePreview}
                    playGuestVideo={playGuestVideo}
                    startCapture={startCapture}
                    openCapturePlayerTab={openCapturePlayerTab}
                    hideHostShareCtas={hostExtension.present}
                    hostSourceOpensOnYoutube={
                      room
                        ? hostSourceOpensOnYoutube({
                            catalogEp,
                            catalogEpisodeId: room.catalogEpisodeId,
                            origin: getPublicOrigin(),
                          })
                        : false
                    }
                  />
                )
              }
            />
          </div>

          {!expandedViewActive ? <RoomPageSidebar {...roomSidebarProps} /> : null}
        </div>
        {isPublisher ? (
          <HostControlBar
            roomMode={roomMode}
            avDisabled={avDisabled}
            busy={hostBarBusy}
            error={hostBarErr}
            onSelectRoomMode={(mode) => void patchHostRoomFields({ roomMode: mode })}
            onToggleAvDisabled={(next) => void patchHostRoomFields({ avDisabled: next })}
          />
        ) : null}
      </div>

      {renameModalOpen && isPublisher ? (
        <RoomRenameModal
          renameModalDraft={renameModalDraft}
          patchErr={patchErr}
          onDraftChange={setRenameModalDraft}
          onCancel={() => {
            setPatchErr(null)
            setRenameModalOpen(false)
          }}
          onSave={() =>
            void saveRenameFromModal().then((ok) => {
              if (ok) {
                setPatchErr(null)
                setRenameModalOpen(false)
              }
            })
          }
        />
      ) : null}
    </div>
  )
}
