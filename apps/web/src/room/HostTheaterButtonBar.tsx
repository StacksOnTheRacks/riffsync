import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { RoomMode } from '../api/roomsApi'
import { HostControlBar } from './HostControlBar'
import type { CastAvailabilityState } from './cast/castAvailabilityTypes'
import type { CastStartLifecycle } from './cast/castChannelProtocol'
import type { ParticipantAvController } from './sfu/participantAvSession'
import type { RoomVisibility } from './hostRoomControls'
import { RoomVisibilityControl } from './RoomVisibilityControl'
import {
  PARTICIPANT_AV_DISABLED_COPY,
} from './participantAvErrorCopy'
import { messageForParticipantAvError } from './drawerErrorPresentation'

export type HostTheaterButtonBarProps = {
  extensionPresent: boolean
  mediaTabOpen: boolean
  mediaPlaybackControllable: boolean
  captureActive: boolean
  transportBusy: boolean
  onOpenLoadMedia: () => void
  loadMediaOpenerRef?: RefObject<HTMLButtonElement | null>
  onToggleChatRail: () => void
  chatRailOpen: boolean
  onLeave: () => void
  participantAvController: ParticipantAvController | null
  avDisabled: boolean
  showAvControls: boolean
  onLocalToggleAnnounce: (message: string) => void
  castAvailability: CastAvailabilityState
  castStartLifecycle: CastStartLifecycle
  onCastToTvClick: () => void
  castToTvButtonRef?: RefObject<HTMLButtonElement | null>
  onLinkTvClick: () => void
  linkTvActive: boolean
  linkTvButtonRef?: RefObject<HTMLButtonElement | null>
  onStartBroadcast: () => void
  onStopBroadcast: () => void
  onPlay: () => void
  onPause: () => void
  onCopyShare: () => void
  shareHint: string | null
  onOpenRenameModal: () => void
  roomVisibility: RoomVisibility
  visibilityBusy: boolean
  visibilityErr: string | null
  onSelectRoomVisibility: (visibility: RoomVisibility) => void
  roomMode: RoomMode
  hostBarBusy: boolean
  hostBarErr: string | null
  onSelectRoomMode: (mode: RoomMode) => void
  onToggleAvDisabled: (next: boolean) => void
}

type PopupKind = 'broadcast' | 'cast' | 'share' | 'help' | null

const AV_EMPTY_STATE = {
  cameraEnabled: false,
  micEnabled: false,
  canPublish: false,
  busy: false,
  error: null,
} as const

export function HostTheaterButtonBar(props: HostTheaterButtonBarProps) {
  const {
    extensionPresent,
    mediaTabOpen,
    mediaPlaybackControllable,
    captureActive,
    transportBusy,
    onOpenLoadMedia,
    loadMediaOpenerRef,
    onToggleChatRail,
    chatRailOpen,
    onLeave,
    participantAvController,
    avDisabled,
    showAvControls,
    onLocalToggleAnnounce,
    castAvailability,
    castStartLifecycle,
    onCastToTvClick,
    castToTvButtonRef,
    onLinkTvClick,
    linkTvActive,
    linkTvButtonRef,
    onStartBroadcast,
    onStopBroadcast,
    onPlay,
    onPause,
    onCopyShare,
    shareHint,
    onOpenRenameModal,
    roomVisibility,
    visibilityBusy,
    visibilityErr,
    onSelectRoomVisibility,
    roomMode,
    hostBarBusy,
    hostBarErr,
    onSelectRoomMode,
    onToggleAvDisabled,
  } = props

  const [openPopup, setOpenPopup] = useState<PopupKind>(null)
  const popupOpenerRef = useRef<HTMLButtonElement | null>(null)
  const [avState, setAvState] = useState(() =>
    participantAvController ? participantAvController.getState() : AV_EMPTY_STATE,
  )
  const [trackedAvController, setTrackedAvController] = useState(participantAvController)
  if (participantAvController !== trackedAvController) {
    setTrackedAvController(participantAvController)
    setAvState(participantAvController ? participantAvController.getState() : AV_EMPTY_STATE)
  }

  useEffect(() => {
    if (!participantAvController) return
    return participantAvController.subscribe(() => {
      setAvState(participantAvController.getState())
    })
  }, [participantAvController])

  const barClass = extensionPresent
    ? 'riffsync-host-theater-bar riffsync-host-theater-bar--extension'
    : 'riffsync-host-theater-bar'

  const closePopup = useCallback(() => {
    setOpenPopup(null)
    window.setTimeout(() => popupOpenerRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!openPopup) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopup()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closePopup, openPopup])

  const openPopupFrom = (kind: PopupKind, opener: HTMLButtonElement | null) => {
    popupOpenerRef.current = opener
    setOpenPopup(kind)
  }

  const avControlsDisabled =
    !showAvControls || avDisabled || !participantAvController || !avState.canPublish || avState.busy
  const castDisabled =
    castAvailability !== 'available' ||
    castStartLifecycle === 'launching' ||
    castStartLifecycle === 'session_pending_render'

  const broadcastLabel = captureActive ? 'Stop broadcasting' : 'Start broadcasting'

  const toggleCamera = useCallback(() => {
    if (!participantAvController || avControlsDisabled) return
    if (avState.cameraEnabled) {
      participantAvController.disableCamera()
      onLocalToggleAnnounce('Camera off')
      return
    }
    void participantAvController.enableCamera().then(() => {
      if (participantAvController.getState().cameraEnabled) {
        onLocalToggleAnnounce('Camera on')
      }
    })
  }, [avControlsDisabled, avState.cameraEnabled, onLocalToggleAnnounce, participantAvController])

  const toggleMic = useCallback(() => {
    if (!participantAvController || avControlsDisabled) return
    if (avState.micEnabled) {
      participantAvController.disableMic()
      onLocalToggleAnnounce('Microphone off')
      return
    }
    void participantAvController.enableMic().then(() => {
      if (participantAvController.getState().micEnabled) {
        onLocalToggleAnnounce('Microphone on')
      }
    })
  }, [avControlsDisabled, avState.micEnabled, onLocalToggleAnnounce, participantAvController])

  return (
    <div className={barClass} role="toolbar" aria-label="Host theater controls">
      <div className="riffsync-host-theater-bar__segments">
        <button
          ref={loadMediaOpenerRef}
          type="button"
          className="riffsync-host-theater-bar__segment riffsync-host-theater-bar__segment--load-media"
          aria-label="Load media"
          disabled={transportBusy}
          onClick={onOpenLoadMedia}
        >
          <MonitorIcon />
          <ChevronIcon />
          <span className="sr-only">Load media</span>
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${chatRailOpen ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label={chatRailOpen ? 'Hide chat panel' : 'Show chat panel'}
          aria-pressed={chatRailOpen}
          onClick={onToggleChatRail}
        >
          <ChatPanelIcon />
        </button>

        <button
          type="button"
          className="riffsync-host-theater-bar__segment"
          aria-label="Leave party"
          onClick={onLeave}
        >
          <LeaveIcon />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${avState.cameraEnabled ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label={avState.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
          aria-pressed={avState.cameraEnabled}
          disabled={avControlsDisabled}
          onClick={toggleCamera}
        >
          <CameraIcon />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${avState.micEnabled ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label={avState.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          aria-pressed={avState.micEnabled}
          disabled={avControlsDisabled}
          onClick={toggleMic}
        >
          <MicIcon />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${openPopup === 'broadcast' || openPopup === 'cast' ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label="Broadcast and TV options"
          aria-haspopup="dialog"
          aria-expanded={openPopup === 'broadcast' || openPopup === 'cast'}
          onClick={(event) => {
            if (mediaTabOpen || captureActive) {
              openPopupFrom('broadcast', event.currentTarget)
            } else {
              openPopupFrom('cast', event.currentTarget)
            }
          }}
        >
          <CastBroadcastIcon />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${openPopup === 'share' ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label="Share watch party"
          aria-haspopup="dialog"
          aria-expanded={openPopup === 'share'}
          onClick={(event) => openPopupFrom('share', event.currentTarget)}
        >
          <ShareIcon />
        </button>

        {extensionPresent && mediaTabOpen ? (
          <>
            <button
              type="button"
              className="riffsync-host-theater-bar__segment"
              aria-label="Play"
              disabled={!mediaPlaybackControllable || transportBusy}
              onClick={onPlay}
            >
              <PlayIcon />
            </button>
            <button
              type="button"
              className="riffsync-host-theater-bar__segment"
              aria-label="Pause"
              disabled={!mediaPlaybackControllable || transportBusy}
              onClick={onPause}
            >
              <PauseIcon />
            </button>
          </>
        ) : null}

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${openPopup === 'help' ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label="Host help and room settings"
          aria-haspopup="dialog"
          aria-expanded={openPopup === 'help'}
          onClick={(event) => openPopupFrom('help', event.currentTarget)}
        >
          <HelpIcon />
        </button>
      </div>

      {avDisabled ? (
        <p className="riffsync-host-theater-bar__av-note" role="status">
          {PARTICIPANT_AV_DISABLED_COPY}
        </p>
      ) : null}
      {avState.error ? (
        <p className="riffsync-host-theater-bar__av-note" role="alert">
          {messageForParticipantAvError(avState.error)}
        </p>
      ) : null}

      {openPopup === 'broadcast' ? (
        <HostTheaterDialog title="Broadcast" onClose={closePopup}>
          {captureActive ? (
            <button
              type="button"
              className="gen-button gen-button-wide"
              disabled={transportBusy}
              onClick={() => {
                onStopBroadcast()
                closePopup()
              }}
            >
              {broadcastLabel}
            </button>
          ) : (
            <button
              type="button"
              className="gen-button gen-button-wide"
              disabled={transportBusy}
              onClick={() => {
                onStartBroadcast()
                closePopup()
              }}
            >
              {broadcastLabel}
            </button>
          )}
        </HostTheaterDialog>
      ) : null}

      {openPopup === 'cast' ? (
        <HostTheaterDialog title="Watch on TV" onClose={closePopup}>
          <button
            ref={castToTvButtonRef}
            type="button"
            className="gen-button gen-button-wide"
            disabled={castDisabled}
            onClick={() => {
              onCastToTvClick()
              closePopup()
            }}
          >
            Cast to TV
          </button>
          <button
            ref={linkTvButtonRef}
            type="button"
            className={`gen-button gen-button-wide${linkTvActive ? ' gen-button--on' : ''}`}
            onClick={() => {
              onLinkTvClick()
            }}
          >
            {linkTvActive ? 'Link TV active' : 'Link TV with code'}
          </button>
        </HostTheaterDialog>
      ) : null}

      {openPopup === 'share' ? (
        <HostTheaterDialog title="Share Watch Party" onClose={closePopup}>
          <button
            type="button"
            className="gen-button gen-button-wide"
            onClick={() => {
              onCopyShare()
            }}
          >
            Copy party link
          </button>
          <button type="button" className="gen-button gen-button-wide" onClick={onOpenRenameModal}>
            Rename party
          </button>
          {shareHint ? (
            <p className="riffsync-host-theater-bar__hint" role="status">
              {shareHint}
            </p>
          ) : null}
          <RoomVisibilityControl
            visibility={roomVisibility}
            busy={visibilityBusy}
            error={visibilityErr}
            onSelectVisibility={onSelectRoomVisibility}
          />
        </HostTheaterDialog>
      ) : null}

      {openPopup === 'help' ? (
        <HostTheaterDialog title="Host settings" onClose={closePopup}>
          <HostControlBar
            roomMode={roomMode}
            avDisabled={avDisabled}
            busy={hostBarBusy}
            error={hostBarErr}
            onSelectRoomMode={onSelectRoomMode}
            onToggleAvDisabled={onToggleAvDisabled}
          />
        </HostTheaterDialog>
      ) : null}
    </div>
  )
}

function HostTheaterDialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const titleId = useId()
  return (
    <div className="riffsync-host-theater-bar__dialog-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="riffsync-host-theater-bar__dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="riffsync-host-theater-bar__dialog-title">
          {title}
        </h2>
        <div className="riffsync-host-theater-bar__dialog-body">{children}</div>
        <button type="button" className="gen-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="currentColor"
        d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h8v2H8v2h8v-2h-2v-2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"
      />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true" className="riffsync-host-theater-bar__chevron">
      <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
    </svg>
  )
}

function ChatPanelIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"
      />
    </svg>
  )
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
      />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="currentColor"
        d="M17 10.5V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5l4 3v-9l-4 3z"
      />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
      />
    </svg>
  )
}

function CastBroadcastIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <circle cx="6" cy="12" r="2.25" fill="currentColor" />
      <circle cx="18" cy="6" r="2.25" fill="currentColor" />
      <circle cx="18" cy="18" r="2.25" fill="currentColor" />
      <path
        d="M8 11.2 16 7.2M8 12.8 16 16.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  )
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26A1.99 1.99 0 0 0 12 8a2 2 0 1 0-2 2H8a4 4 0 1 1 4-4c1.05 0 2 .42 2.71 1.08.69.66 1.29 1.57 1.29 2.67 0 1.19-.55 2.08-1.93 3.25z"
      />
    </svg>
  )
}
