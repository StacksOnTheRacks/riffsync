import { createElement, type RefObject } from 'react'
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
      {createElement('google-cast-launcher', {
        'aria-hidden': 'true',
        className: 'riffsync-room-page__cast-launcher-glyph',
        tabIndex: -1,
      })}
      Cast to TV
    </button>
  )
}
