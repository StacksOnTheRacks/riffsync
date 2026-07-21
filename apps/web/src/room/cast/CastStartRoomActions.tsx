import type { RefObject } from 'react'
import {
  CAST_CHOOSING_DEVICE_MESSAGE,
  CAST_CONNECTING_TO_TV_MESSAGE,
  CAST_PLAYBACK_BLOCKED_MESSAGE,
  CAST_SESSION_ENDED_MESSAGE,
  CAST_START_REJECTED_MESSAGE,
  RIFFSYNC_CAST_START_STATUS_ID,
} from './castStartStatusCopy'
import type { CastStartLifecycle } from './castChannelProtocol'
import {
  CAST_UNAVAILABLE_MESSAGE,
  RIFFSYNC_CAST_AVAILABILITY_STATUS_ID,
  type CastAvailabilityState,
} from './castAvailabilityTypes'

type CastStartRoomActionsProps = {
  castAvailability: CastAvailabilityState
  castStartLifecycle: CastStartLifecycle
  onCastToTvClick: () => void
  castToTvButtonRef?: RefObject<HTMLButtonElement | null>
}

export function CastStartRoomActions({
  castAvailability,
  castStartLifecycle,
  onCastToTvClick,
  castToTvButtonRef,
}: CastStartRoomActionsProps) {
  if (castAvailability === 'checking') return null

  if (castAvailability === 'unavailable') {
    return (
      <p
        id={RIFFSYNC_CAST_AVAILABILITY_STATUS_ID}
        className="riffsync-room-page__cast-availability-status riffsync-muted"
        role="status"
        aria-live="polite"
      >
        {CAST_UNAVAILABLE_MESSAGE}
      </p>
    )
  }

  if (castStartLifecycle === 'launching' || castStartLifecycle === 'session_pending_render') {
    const statusCopy =
      castStartLifecycle === 'launching'
        ? CAST_CHOOSING_DEVICE_MESSAGE
        : CAST_CONNECTING_TO_TV_MESSAGE
    return (
      <p
        id={RIFFSYNC_CAST_START_STATUS_ID}
        className="riffsync-room-page__cast-start-status riffsync-muted"
        role="status"
        aria-live="polite"
      >
        {statusCopy}
      </p>
    )
  }

  const recoveryMessage =
    castStartLifecycle === 'start_failed'
      ? CAST_START_REJECTED_MESSAGE
      : castStartLifecycle === 'session_ended'
        ? CAST_SESSION_ENDED_MESSAGE
        : castStartLifecycle === 'playback_blocked'
          ? CAST_PLAYBACK_BLOCKED_MESSAGE
          : null

  if (recoveryMessage) {
    return (
      <>
        <p
          id={RIFFSYNC_CAST_START_STATUS_ID}
          className="riffsync-room-page__cast-start-status riffsync-muted"
          role="status"
          aria-live="polite"
        >
          {recoveryMessage}
        </p>
        <button
          ref={castToTvButtonRef}
          type="button"
          className="gen-button gen-button-wide"
          onClick={onCastToTvClick}
        >
          Cast to TV
        </button>
      </>
    )
  }

  if (castStartLifecycle === 'casting' || castStartLifecycle === 'stopping' || castStartLifecycle === 'stop_failed') {
    return null
  }

  return (
    <button
      ref={castToTvButtonRef}
      type="button"
      className="gen-button gen-button-wide riffsync-room-page__cast-launch-button"
      onClick={onCastToTvClick}
    >
      <svg
        className="riffsync-room-page__cast-launcher-glyph"
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
      </svg>
      Cast to TV
    </button>
  )
}
