import {
  CAST_UNAVAILABLE_MESSAGE,
  RIFFSYNC_CAST_AVAILABILITY_STATUS_ID,
  type CastAvailabilityState,
} from './castAvailabilityTypes'

type CastAvailabilityRoomActionsProps = {
  castAvailability: CastAvailabilityState
  onCastToTvClick: () => void
}

export function CastAvailabilityRoomActions({
  castAvailability,
  onCastToTvClick,
}: CastAvailabilityRoomActionsProps) {
  if (castAvailability === 'checking') return null

  if (castAvailability === 'available') {
    return (
      <button type="button" className="gen-button gen-button-wide" onClick={onCastToTvClick}>
        Cast to TV
      </button>
    )
  }

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
