export type CastAvailabilityState = 'checking' | 'available' | 'unavailable'

export const CAST_UNAVAILABLE_MESSAGE = 'Cast is not available in this browser or device.'

export const RIFFSYNC_CAST_AVAILABILITY_STATUS_ID = 'riffsync-cast-availability-status'

export type CastSenderSupportDetector = () => Promise<boolean>
