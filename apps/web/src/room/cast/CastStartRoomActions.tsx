import type { RefObject } from 'react'
import {
  CAST_STARTING_MESSAGE,
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

  if (castStartLifecycle === 'starting') {
    return (
      <p
        id={RIFFSYNC_CAST_START_STATUS_ID}
        className="riffsync-room-page__cast-start-status riffsync-muted"
        role="status"
        aria-live="polite"
      >
        {CAST_STARTING_MESSAGE}
      </p>
    )
  }

  if (castStartLifecycle === 'start_failed') {
    return (
      <>
        <p
          id={RIFFSYNC_CAST_START_STATUS_ID}
          className="riffsync-room-page__cast-start-status riffsync-muted"
          role="status"
          aria-live="polite"
        >
          {CAST_START_REJECTED_MESSAGE}
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

  if (castStartLifecycle === 'casting') {
    return null
  }

  return (
    <button
      ref={castToTvButtonRef}
      type="button"
      className="gen-button gen-button-wide"
      onClick={onCastToTvClick}
    >
      Cast to TV
    </button>
  )
}
