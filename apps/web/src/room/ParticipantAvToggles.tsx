import { useCallback, useEffect, useId, useState } from 'react'
import type { ParticipantAvController } from './sfu/participantAvSession'
import {
  PARTICIPANT_AV_DISABLED_COPY,
  participantAvErrorMessage,
} from './participantAvErrorCopy'

export type ParticipantAvTogglesProps = {
  controller: ParticipantAvController
  avDisabled: boolean
  onLocalToggleAnnounce: (message: string) => void
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

export function ParticipantAvToggles({
  controller,
  avDisabled,
  onLocalToggleAnnounce,
}: ParticipantAvTogglesProps) {
  const killSwitchId = useId()
  const cameraErrId = useId()
  const micErrId = useId()
  const [state, setState] = useState(() => controller.getState())

  useEffect(() => controller.subscribe(() => setState(controller.getState())), [controller])

  const killSwitchActive = avDisabled
  const activationBlocked = killSwitchActive || !state.canPublish || state.busy

  const inlineErr = state.error ? participantAvErrorMessage(state.error) : null
  const cameraErr = inlineErr
  const micErr = inlineErr

  const cameraDescribedBy = [
    killSwitchActive ? killSwitchId : null,
    cameraErr ? cameraErrId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  const micDescribedBy = [
    killSwitchActive ? killSwitchId : null,
    micErr ? micErrId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  const toggleCamera = useCallback(() => {
    if (activationBlocked) return
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
    if (activationBlocked) return
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

  return (
    <div className="riffsync-room-av" role="group" aria-label="Camera and microphone">
      {killSwitchActive ? (
        <p className="riffsync-room-av__kill-switch" id={killSwitchId}>
          {PARTICIPANT_AV_DISABLED_COPY}
        </p>
      ) : null}
      <div className="riffsync-room-av__toggles">
        <button
          type="button"
          className={`gen-button riffsync-room-av-toggle${state.cameraEnabled ? ' riffsync-room-av-toggle--on' : ''}`}
          aria-pressed={state.cameraEnabled}
          aria-disabled={activationBlocked || undefined}
          aria-describedby={cameraDescribedBy}
          disabled={state.busy}
          onClick={toggleCamera}
        >
          <CameraIcon />
          <span className="riffsync-room-av-toggle__label">Camera</span>
        </button>
        <button
          type="button"
          className={`gen-button riffsync-room-av-toggle${state.micEnabled ? ' riffsync-room-av-toggle--on' : ''}`}
          aria-pressed={state.micEnabled}
          aria-disabled={activationBlocked || undefined}
          aria-describedby={micDescribedBy}
          disabled={state.busy}
          onClick={toggleMic}
        >
          <MicrophoneIcon />
          <span className="riffsync-room-av-toggle__label">Microphone</span>
        </button>
      </div>
      {cameraErr ? (
        <p className="riffsync-room-av__err" id={cameraErrId} role="status">
          {cameraErr}
        </p>
      ) : null}
      {micErr && micErr !== cameraErr ? (
        <p className="riffsync-room-av__err" id={micErrId} role="status">
          {micErr}
        </p>
      ) : null}
    </div>
  )
}
