import { useCallback, useEffect, useId, useState, type RefObject } from 'react'
import type { ParticipantAvController } from './sfu/participantAvSession'
import {
  PARTICIPANT_AV_DISABLED_COPY,
} from './participantAvErrorCopy'
import { messageForParticipantAvError, RIFFSYNC_AV_TOGGLE_STATUS_ID } from './drawerErrorPresentation'
import type { CastAvailabilityState } from './cast/castAvailabilityTypes'
import type { CastStartLifecycle } from './cast/castChannelProtocol'
import {
  CAST_CHOOSING_DEVICE_MESSAGE,
  CAST_CONNECTING_TO_TV_MESSAGE,
  CAST_PLAYBACK_BLOCKED_MESSAGE,
  CAST_SESSION_ENDED_MESSAGE,
  CAST_START_REJECTED_MESSAGE,
  RIFFSYNC_CAST_START_STATUS_ID,
} from './cast/castStartStatusCopy'
import { CAST_UNAVAILABLE_MESSAGE, RIFFSYNC_CAST_AVAILABILITY_STATUS_ID } from './cast/castAvailabilityTypes'

const PARTICIPANT_AV_EMPTY_STATE = {
  cameraEnabled: false,
  micEnabled: false,
  canPublish: false,
  busy: false,
  error: null,
} as const

export type ParticipantAvTogglesProps = {
  controller: ParticipantAvController | null
  avDisabled: boolean
  onLocalToggleAnnounce: (message: string) => void
  showAvControls: boolean
  castAvailability: CastAvailabilityState
  castStartLifecycle: CastStartLifecycle
  onCastToTvClick: () => void
  castToTvButtonRef?: RefObject<HTMLButtonElement | null>
  onLinkTvClick: () => void
  linkTvActive: boolean
  linkTvButtonRef?: RefObject<HTMLButtonElement | null>
}

function CameraIcon() {
  return (
    <svg
      className="riffsync-room-av-toggle__icon"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M17 10.5V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5l4 3v-9l-4 3z"
      />
    </svg>
  )
}

function MicrophoneIcon() {
  return (
    <svg
      className="riffsync-room-av-toggle__icon"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
      />
    </svg>
  )
}

function CastIcon() {
  return (
    <svg
      className="riffsync-room-av-toggle__icon"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
      />
    </svg>
  )
}

function LinkTvIcon() {
  return (
    <svg
      className="riffsync-room-av-toggle__icon"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zM9 8h2v2H9V8zm0 3h2v2H9v-2zm3-3h2v2h-2V8zm0 3h2v2h-2v-2zm3-3h2v2h-2V8zm0 3h2v2h-2v-2z"
      />
    </svg>
  )
}

function castLifecycleIsActive(lifecycle: CastStartLifecycle): boolean {
  return lifecycle === 'casting' || lifecycle === 'stopping' || lifecycle === 'stop_failed'
}

function castLifecycleIsPending(lifecycle: CastStartLifecycle): boolean {
  return lifecycle === 'launching' || lifecycle === 'session_pending_render'
}

export function ParticipantAvToggles({
  controller,
  avDisabled,
  onLocalToggleAnnounce,
  showAvControls,
  castAvailability,
  castStartLifecycle,
  onCastToTvClick,
  castToTvButtonRef,
  onLinkTvClick,
  linkTvActive,
  linkTvButtonRef,
}: ParticipantAvTogglesProps) {
  const killSwitchId = useId()
  const [state, setState] = useState(() =>
    controller ? controller.getState() : PARTICIPANT_AV_EMPTY_STATE,
  )
  const [trackedController, setTrackedController] = useState(controller)
  if (controller !== trackedController) {
    setTrackedController(controller)
    setState(controller ? controller.getState() : PARTICIPANT_AV_EMPTY_STATE)
  }

  useEffect(() => {
    if (!controller) return
    return controller.subscribe(() => setState(controller.getState()))
  }, [controller])

  const killSwitchActive = avDisabled
  const activationBlocked = !controller || killSwitchActive || !state.canPublish || state.busy
  const inlineErr = showAvControls && state.error ? messageForParticipantAvError(state.error) : null

  const toggleDescribedBy = [
    killSwitchActive ? killSwitchId : null,
    inlineErr ? RIFFSYNC_AV_TOGGLE_STATUS_ID : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  const toggleCamera = useCallback(() => {
    if (!controller || activationBlocked) return
    if (state.cameraEnabled) {
      controller.disableCamera()
      onLocalToggleAnnounce('Camera off')
      return
    }
    void controller.enableCamera().then(() => {
      if (controller.getState().cameraEnabled) {
        onLocalToggleAnnounce('Camera on')
      }
    })
  }, [activationBlocked, controller, onLocalToggleAnnounce, state.cameraEnabled])

  const toggleMic = useCallback(() => {
    if (!controller || activationBlocked) return
    if (state.micEnabled) {
      controller.disableMic()
      onLocalToggleAnnounce('Microphone off')
      return
    }
    void controller.enableMic().then(() => {
      if (controller.getState().micEnabled) {
        onLocalToggleAnnounce('Microphone on')
      }
    })
  }, [activationBlocked, controller, onLocalToggleAnnounce, state.micEnabled])

  const castActive = castLifecycleIsActive(castStartLifecycle)
  const castPending = castLifecycleIsPending(castStartLifecycle)
  const castDisabled = castAvailability !== 'available' || castPending
  const castStatus =
    castAvailability === 'unavailable'
      ? CAST_UNAVAILABLE_MESSAGE
      : castStartLifecycle === 'launching'
        ? CAST_CHOOSING_DEVICE_MESSAGE
        : castStartLifecycle === 'session_pending_render'
          ? CAST_CONNECTING_TO_TV_MESSAGE
          : castStartLifecycle === 'start_failed'
            ? CAST_START_REJECTED_MESSAGE
            : castStartLifecycle === 'session_ended'
              ? CAST_SESSION_ENDED_MESSAGE
              : castStartLifecycle === 'playback_blocked'
                ? CAST_PLAYBACK_BLOCKED_MESSAGE
                : null

  return (
    <div className="riffsync-room-av" role="group" aria-label="Camera, microphone, and TV">
      {showAvControls && killSwitchActive ? (
        <p className="riffsync-room-av__kill-switch" id={killSwitchId}>
          {PARTICIPANT_AV_DISABLED_COPY}
        </p>
      ) : null}
      <div className="riffsync-room-av__toggles">
        {showAvControls ? (
          <>
            <button
              type="button"
              className={`gen-button riffsync-room-av-toggle${state.cameraEnabled ? ' riffsync-room-av-toggle--on' : ''}`}
              aria-label="Camera"
              title="Camera"
              aria-pressed={state.cameraEnabled}
              aria-disabled={activationBlocked || undefined}
              aria-describedby={toggleDescribedBy}
              disabled={state.busy}
              onClick={toggleCamera}
            >
              <CameraIcon />
            </button>
            <button
              type="button"
              className={`gen-button riffsync-room-av-toggle${state.micEnabled ? ' riffsync-room-av-toggle--on' : ''}`}
              aria-label="Microphone"
              title="Microphone"
              aria-pressed={state.micEnabled}
              aria-disabled={activationBlocked || undefined}
              aria-describedby={toggleDescribedBy}
              disabled={state.busy}
              onClick={toggleMic}
            >
              <MicrophoneIcon />
            </button>
          </>
        ) : null}
        {castAvailability !== 'checking' ? (
          <button
            ref={castToTvButtonRef}
            type="button"
            className={`gen-button riffsync-room-av-toggle${castActive ? ' riffsync-room-av-toggle--on' : ''}`}
            aria-label={castActive ? 'Stop Cast' : 'Cast'}
            title={castActive ? 'Stop Cast' : 'Cast'}
            aria-pressed={castActive}
            aria-disabled={castDisabled && !castActive ? true : undefined}
            disabled={castDisabled && !castActive}
            onClick={onCastToTvClick}
            data-testid="room-av-cast-button"
          >
            <CastIcon />
          </button>
        ) : null}
        <button
          ref={linkTvButtonRef}
          type="button"
          className={`gen-button riffsync-room-av-toggle${linkTvActive ? ' riffsync-room-av-toggle--on' : ''}`}
          aria-label="Link TV"
          title="Link TV"
          aria-pressed={linkTvActive}
          onClick={onLinkTvClick}
          data-testid="room-av-link-tv-button"
        >
          <LinkTvIcon />
        </button>
      </div>
      {castStatus ? (
        <p
          id={
            castAvailability === 'unavailable'
              ? RIFFSYNC_CAST_AVAILABILITY_STATUS_ID
              : RIFFSYNC_CAST_START_STATUS_ID
          }
          className="riffsync-room-av__err"
          role="status"
          aria-live="polite"
        >
          {castStatus}
        </p>
      ) : null}
      {inlineErr ? (
        <p
          className="riffsync-room-av__err"
          id={RIFFSYNC_AV_TOGGLE_STATUS_ID}
          role="status"
          aria-live="polite"
        >
          {inlineErr}
        </p>
      ) : null}
    </div>
  )
}
