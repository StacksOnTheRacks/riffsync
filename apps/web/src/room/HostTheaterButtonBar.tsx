import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { RoomMode } from '../api/roomsApi'
import type { CastAvailabilityState } from './cast/castAvailabilityTypes'
import type { CastStartLifecycle } from './cast/castChannelProtocol'
import type { ParticipantAvController } from './sfu/participantAvSession'
import type { RoomVisibility } from './hostRoomControls'
import { RoomVisibilityControl } from './RoomVisibilityControl'
import {
  TheaterShareQualityControls,
} from './TheaterShareQualityControls'
import type { TheaterShareQualityPreset } from './theaterShareQuality'
import {
  PARTICIPANT_AV_DISABLED_COPY,
} from './participantAvErrorCopy'
import { messageForParticipantAvError } from './drawerErrorPresentation'
import { getTvLinkUrl } from '../tv/tvLinkPath'

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
  participantAvController: ParticipantAvController | null
  avDisabled: boolean
  showAvControls: boolean
  onLocalToggleAnnounce: (message: string) => void
  castAvailability: CastAvailabilityState
  castStartLifecycle: CastStartLifecycle
  onCastToTvClick: () => void
  castToTvButtonRef?: RefObject<HTMLButtonElement | null>
  onLinkTvSubmitCode: (code: string) => Promise<void>
  onStopLinkTv: () => void
  linkTvActive: boolean
  linkTvButtonRef?: RefObject<HTMLButtonElement | null>
  onStartBroadcast: () => void
  onStopBroadcast: () => void
  onPlay: () => void
  onPause: () => void
  onCopyShare: () => void
  shareHint: string | null
  partyNameDraft: string
  onPartyNameDraftChange: (draft: string) => void
  onOpenSettings: () => void
  onSavePartyName: () => void
  partyNameBusy: boolean
  partyNameErr: string | null
  partyUrl: string
  roomVisibility: RoomVisibility
  visibilityBusy: boolean
  visibilityErr: string | null
  onSelectRoomVisibility: (visibility: RoomVisibility) => void
  theaterShareQuality: TheaterShareQualityPreset
  onTheaterShareQualityChange: (preset: TheaterShareQualityPreset) => void
  roomMode: RoomMode
  hostBarBusy: boolean
  hostBarErr: string | null
  onSelectRoomMode: (mode: RoomMode) => void
}

type PopupKind = 'mode' | 'cast' | 'settings' | 'help' | null

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const PARTY_NAME_MAX_LEN = 120
type HostTheaterModeOption = 'theater' | 'videoChat' | 'games'

const MODE_OPTIONS: Array<{
  value: HostTheaterModeOption
  label: string
  icon: string
  roomMode: RoomMode | null
}> = [
  { value: 'theater', label: 'Watch Party', icon: '/host-theater/monitor.svg', roomMode: 'theater' },
  { value: 'videoChat', label: 'Video Chat', icon: '/host-theater/video.svg', roomMode: 'videoChat' },
  { value: 'games', label: 'Games', icon: '/host-theater/game.svg', roomMode: null },
]

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
    participantAvController,
    avDisabled,
    showAvControls,
    onLocalToggleAnnounce,
    castAvailability,
    castStartLifecycle,
    onCastToTvClick,
    castToTvButtonRef,
    onLinkTvSubmitCode,
    onStopLinkTv,
    linkTvActive,
    linkTvButtonRef,
    onStartBroadcast,
    onStopBroadcast,
    onPlay,
    onPause,
    onCopyShare,
    shareHint,
    partyNameDraft,
    onPartyNameDraftChange,
    onOpenSettings,
    onSavePartyName,
    partyNameBusy,
    partyNameErr,
    partyUrl,
    roomVisibility,
    visibilityBusy,
    visibilityErr,
    onSelectRoomVisibility,
    theaterShareQuality,
    onTheaterShareQualityChange,
    roomMode,
    hostBarBusy,
    hostBarErr,
    onSelectRoomMode,
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
    setOpenPopup((current) => {
      const next = current === kind ? null : kind
      if (next === 'settings') onOpenSettings()
      return next
    })
  }

  const avControlsDisabled =
    !showAvControls || avDisabled || !participantAvController || !avState.canPublish || avState.busy
  const castDisabled =
    castAvailability !== 'available' ||
    castStartLifecycle === 'launching' ||
    castStartLifecycle === 'session_pending_render'

  const activeMode = MODE_OPTIONS.find((opt) => opt.roomMode === roomMode) ?? MODE_OPTIONS[0]

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
        <div className="riffsync-host-theater-bar__mode">
          <button
            type="button"
            className={`riffsync-host-theater-bar__segment riffsync-host-theater-bar__segment--mode${openPopup === 'mode' ? ' riffsync-host-theater-bar__segment--on' : ''}`}
            aria-label={`Room mode, ${activeMode.label}`}
            aria-haspopup="listbox"
            aria-expanded={openPopup === 'mode'}
            disabled={hostBarBusy}
            onClick={(event) => openPopupFrom('mode', event.currentTarget)}
          >
            <TheaterBarIcon src={activeMode.icon} />
            <TheaterBarIcon src="/host-theater/arrow-top.svg" className="riffsync-host-theater-bar__chevron" />
          </button>
          {openPopup === 'mode' ? (
            <div
              className="riffsync-host-theater-bar__mode-menu"
              role="listbox"
              aria-label="Room mode"
            >
              {MODE_OPTIONS.map((opt) => {
                const selected = opt.roomMode === roomMode
                const optionDisabled = hostBarBusy || opt.roomMode === null
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-label={opt.label}
                    aria-selected={selected}
                    aria-disabled={optionDisabled || undefined}
                    disabled={optionDisabled}
                    className={`riffsync-host-theater-bar__mode-option${selected ? ' is-selected' : ''}`}
                    onClick={() => {
                      if (optionDisabled || !opt.roomMode || selected) return
                      onSelectRoomMode(opt.roomMode)
                      closePopup()
                    }}
                  >
                    <TheaterBarIcon src={opt.icon} />
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <button
          ref={loadMediaOpenerRef}
          type="button"
          className="riffsync-host-theater-bar__segment"
          aria-label="Load media"
          disabled={transportBusy}
          onClick={onOpenLoadMedia}
        >
          <TheaterBarIcon src="/host-theater/menu-open.svg" />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${captureActive ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label={captureActive ? 'Stop broadcast' : 'Broadcast'}
          aria-pressed={captureActive}
          disabled={transportBusy}
          onClick={() => {
            if (captureActive) {
              onStopBroadcast()
              return
            }
            onStartBroadcast()
          }}
        >
          <TheaterBarIcon src="/host-theater/move-item.svg" />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${avState.cameraEnabled ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label={avState.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
          aria-pressed={avState.cameraEnabled}
          disabled={avControlsDisabled}
          onClick={toggleCamera}
        >
          <TheaterBarIcon src="/host-theater/video.svg" />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${avState.micEnabled ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label={avState.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
          aria-pressed={avState.micEnabled}
          disabled={avControlsDisabled}
          onClick={toggleMic}
        >
          <TheaterBarIcon src="/host-theater/microphone.svg" />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${openPopup === 'cast' ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label="Cast to TV"
          aria-haspopup="dialog"
          aria-expanded={openPopup === 'cast'}
          onClick={(event) => openPopupFrom('cast', event.currentTarget)}
        >
          <TheaterBarIcon src="/host-theater/cast.svg" />
        </button>

        <button
          type="button"
          className={`riffsync-host-theater-bar__segment${openPopup === 'settings' ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label="Settings"
          aria-haspopup="dialog"
          aria-expanded={openPopup === 'settings'}
          aria-pressed={openPopup === 'settings'}
          onClick={(event) => openPopupFrom('settings', event.currentTarget)}
        >
          <TheaterBarIcon src="/host-theater/settings.svg" />
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
          className={`riffsync-host-theater-bar__segment riffsync-host-theater-bar__segment--help${openPopup === 'help' ? ' riffsync-host-theater-bar__segment--on' : ''}`}
          aria-label="Host help and room settings"
          aria-haspopup="dialog"
          aria-expanded={openPopup === 'help'}
          onClick={(event) => openPopupFrom('help', event.currentTarget)}
        >
          <TheaterBarIcon src="/host-theater/help.svg" />
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

      {openPopup === 'cast' ? (
        <WatchOnTvDialog
          onClose={closePopup}
          castDisabled={castDisabled}
          castStartLifecycle={castStartLifecycle}
          onCastToTvClick={onCastToTvClick}
          castToTvButtonRef={castToTvButtonRef}
          onLinkTvSubmitCode={onLinkTvSubmitCode}
          onStopLinkTv={onStopLinkTv}
          linkTvActive={linkTvActive}
          linkTvButtonRef={linkTvButtonRef}
        />
      ) : null}

      {openPopup === 'settings' ? (
        <WatchPartySettingsDialog
          onClose={closePopup}
          partyNameDraft={partyNameDraft}
          onPartyNameDraftChange={onPartyNameDraftChange}
          onSavePartyName={onSavePartyName}
          partyNameBusy={partyNameBusy}
          partyNameErr={partyNameErr}
          partyUrl={partyUrl}
          onCopyShare={onCopyShare}
          shareHint={shareHint}
          roomVisibility={roomVisibility}
          visibilityBusy={visibilityBusy}
          visibilityErr={visibilityErr}
          onSelectRoomVisibility={onSelectRoomVisibility}
          theaterShareQuality={theaterShareQuality}
          onTheaterShareQualityChange={onTheaterShareQualityChange}
        />
      ) : null}

      {openPopup === 'help' ? (
        <HostTheaterDialog title="Host settings" onClose={closePopup}>
          <button
            type="button"
            className="gen-button gen-button-wide"
            aria-pressed={chatRailOpen}
            onClick={onToggleChatRail}
          >
            {chatRailOpen ? 'Hide chat panel' : 'Show chat panel'}
          </button>
          {hostBarErr ? (
            <p className="riffsync-host-theater-bar__hint" role="alert">
              {hostBarErr}
            </p>
          ) : null}
        </HostTheaterDialog>
      ) : null}
    </div>
  )
}

function WatchOnTvDialog({
  onClose,
  castDisabled,
  castStartLifecycle,
  onCastToTvClick,
  castToTvButtonRef,
  onLinkTvSubmitCode,
  onStopLinkTv,
  linkTvActive,
  linkTvButtonRef,
}: {
  onClose: () => void
  castDisabled: boolean
  castStartLifecycle: CastStartLifecycle
  onCastToTvClick: () => void
  castToTvButtonRef?: RefObject<HTMLButtonElement | null>
  onLinkTvSubmitCode: (code: string) => Promise<void>
  onStopLinkTv: () => void
  linkTvActive: boolean
  linkTvButtonRef?: RefObject<HTMLButtonElement | null>
}) {
  const inputId = useId()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tvLinkUrl = getTvLinkUrl()

  useEffect(() => {
    if (
      castStartLifecycle === 'session_pending_render' ||
      castStartLifecycle === 'casting' ||
      castStartLifecycle === 'start_failed'
    ) {
      onClose()
    }
  }, [castStartLifecycle, onClose])

  const submitLink = async () => {
    const trimmed = code.trim()
    if (!trimmed) {
      setError('Enter the code shown on your TV.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await onLinkTvSubmitCode(trimmed)
      setCode('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link TV')
    } finally {
      setBusy(false)
    }
  }

  return (
    <HostTheaterDialog
      title="Watch on TV"
      onClose={onClose}
      className="riffsync-host-theater-bar__dialog--watch-tv"
      hideDefaultClose
    >
      {linkTvActive ? (
        <>
          <p className="riffsync-watch-on-tv__status" role="status">
            TV linked. Party video and chat overlay are streaming to the TV client.
          </p>
          <div className="riffsync-watch-on-tv__actions">
            <button type="button" className="gen-button gen-button--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="gen-button" onClick={onStopLinkTv}>
              Stop Link TV
            </button>
          </div>
        </>
      ) : (
        <form
          className="riffsync-watch-on-tv"
          onSubmit={(event) => {
            event.preventDefault()
            void submitLink()
          }}
        >
          <div className="riffsync-watch-on-tv__instructions">
            <p>
              To use a Chromecast device, skip linking and simply click Chromecast below.
            </p>
            <p>
              If you have a smart TV, navigate it to {tvLinkUrl}. Enter the code that it shows in
              the field, then click Link Smart TV.
            </p>
          </div>
          <div className="riffsync-watch-on-tv__code-row">
            <label className="riffsync-watch-on-tv__label" htmlFor={inputId}>
              TV Link Code
            </label>
            <input
              id={inputId}
              className="riffsync-watch-on-tv__input"
              name="tvLinkCode"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase())
                if (error) setError(null)
              }}
              autoComplete="one-time-code"
              spellCheck={false}
              maxLength={8}
              required
              aria-required="true"
              disabled={busy}
            />
          </div>
          {error ? (
            <p className="riffsync-watch-on-tv__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="riffsync-watch-on-tv__actions">
            <button type="button" className="gen-button gen-button--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              ref={linkTvButtonRef}
              type="submit"
              className="gen-button"
              disabled={busy}
            >
              {busy ? 'Linking…' : 'Link Smart TV'}
            </button>
            <button
              ref={castToTvButtonRef}
              type="button"
              className="gen-button"
              disabled={castDisabled || busy}
              onClick={() => {
                onCastToTvClick()
              }}
            >
              Chromecast
            </button>
          </div>
        </form>
      )}
    </HostTheaterDialog>
  )
}

function WatchPartySettingsDialog({
  onClose,
  partyNameDraft,
  onPartyNameDraftChange,
  onSavePartyName,
  partyNameBusy,
  partyNameErr,
  partyUrl,
  onCopyShare,
  shareHint,
  roomVisibility,
  visibilityBusy,
  visibilityErr,
  onSelectRoomVisibility,
  theaterShareQuality,
  onTheaterShareQualityChange,
}: {
  onClose: () => void
  partyNameDraft: string
  onPartyNameDraftChange: (draft: string) => void
  onSavePartyName: () => void
  partyNameBusy: boolean
  partyNameErr: string | null
  partyUrl: string
  onCopyShare: () => void
  shareHint: string | null
  roomVisibility: RoomVisibility
  visibilityBusy: boolean
  visibilityErr: string | null
  onSelectRoomVisibility: (visibility: RoomVisibility) => void
  theaterShareQuality: TheaterShareQualityPreset
  onTheaterShareQualityChange: (preset: TheaterShareQualityPreset) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const partyNameId = useId()
  const partyUrlId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const focusables = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    )
    focusables[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      )
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="riffsync-host-theater-bar__dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="riffsync-watch-party-settings-title"
        className="riffsync-host-theater-bar__dialog riffsync-host-theater-bar__dialog--watch-party-settings"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="riffsync-watch-party-settings-title" className="riffsync-host-theater-bar__dialog-title">
          Watch Party Settings
        </h2>
        <div className="riffsync-host-theater-bar__dialog-body">
          <div className="riffsync-watch-party-settings__row">
            <label className="riffsync-watch-party-settings__label" htmlFor={partyNameId}>
              Party Name
            </label>
            <div className="riffsync-watch-party-settings__field-row">
              <input
                id={partyNameId}
                className="riffsync-watch-party-settings__input"
                value={partyNameDraft}
                maxLength={PARTY_NAME_MAX_LEN}
                onChange={(event) => onPartyNameDraftChange(event.target.value)}
                disabled={partyNameBusy}
                autoComplete="off"
              />
              <button
                type="button"
                className="gen-button riffsync-watch-party-settings__action"
                disabled={partyNameBusy}
                onClick={onSavePartyName}
              >
                Save
              </button>
            </div>
            {partyNameErr ? (
              <p className="riffsync-watch-party-settings__err" role="alert">
                {partyNameErr}
              </p>
            ) : null}
          </div>

          <div className="riffsync-watch-party-settings__row">
            <label className="riffsync-watch-party-settings__label" htmlFor={partyUrlId}>
              Party URL
            </label>
            <div className="riffsync-watch-party-settings__field-row">
              <input
                id={partyUrlId}
                className="riffsync-watch-party-settings__input"
                value={partyUrl}
                readOnly
              />
              <button
                type="button"
                className="gen-button riffsync-watch-party-settings__action"
                onClick={onCopyShare}
              >
                Copy
              </button>
            </div>
            {shareHint ? (
              <p className="riffsync-host-theater-bar__hint" role="status">
                {shareHint}
              </p>
            ) : null}
          </div>

          <RoomVisibilityControl
            visibility={roomVisibility}
            busy={visibilityBusy}
            error={visibilityErr}
            onSelectVisibility={onSelectRoomVisibility}
          />

          <TheaterShareQualityControls
            value={theaterShareQuality}
            onChange={onTheaterShareQualityChange}
          />
        </div>
        <button type="button" className="gen-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function HostTheaterDialog({
  title,
  onClose,
  children,
  className,
  hideDefaultClose = false,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  className?: string
  hideDefaultClose?: boolean
}) {
  const titleId = useId()
  return (
    <div className="riffsync-host-theater-bar__dialog-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`riffsync-host-theater-bar__dialog${className ? ` ${className}` : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="riffsync-host-theater-bar__dialog-title">
          {title}
        </h2>
        <div className="riffsync-host-theater-bar__dialog-body">{children}</div>
        {hideDefaultClose ? null : (
          <button type="button" className="gen-button" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  )
}

function TheaterBarIcon({ src, className }: { src: string; className?: string }) {
  return (
    <span className={`riffsync-host-theater-bar__icon${className ? ` ${className}` : ''}`}>
      <img src={src} alt="" width={24} height={24} />
    </span>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true">
      <path fill="currentColor" d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  )
}
