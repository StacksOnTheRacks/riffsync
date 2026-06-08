/** Host AV kill switch copy (`.ai/business_logic/error_state.md`). */
export const PARTICIPANT_AV_DISABLED_COPY = 'The host turned room A/V off.'

const PERMISSION_DENIED_COPY =
  'Camera/microphone permission was blocked. Check browser or system settings, then try again.'

const DEVICE_UNAVAILABLE_COPY =
  'No camera or microphone was found, or the device is in use by another app.'

const SFU_PUBLISH_REJECTED_COPY =
  'Could not publish your camera/microphone. Try again in a moment.'

const SFU_SIGNALING_FAILED_COPY =
  'Video relay connection lost. Refresh the page or wait for automatic reconnect.'

const PUBLISHER_CAP_COPY =
  'This room has reached the maximum number of live cameras and microphones. Wait for someone to turn off A/V or ask the host.'

const RATE_LIMITED_COPY = 'Too many connection attempts. Wait a moment and try again.'

/** Map controller / relay errors to recoverable inline copy at toggles. */
export function formatParticipantAvToggleError(error: string | null): string | null {
  if (!error || error.trim() === '') return null
  const lower = error.toLowerCase()
  if (lower.includes('permission') || lower.includes('notallowed')) {
    return PERMISSION_DENIED_COPY
  }
  if (
    lower.includes('notfound') ||
    lower.includes('notreadable') ||
    lower.includes('overconstrained') ||
    lower.includes('no camera or microphone') ||
    lower.includes('could not access camera or microphone')
  ) {
    return DEVICE_UNAVAILABLE_COPY
  }
  if (lower.includes('publisher_cap') || lower.includes('maximum number of live')) {
    return PUBLISHER_CAP_COPY
  }
  if (lower.includes('rate_limited') || lower.includes('too many connection')) {
    return RATE_LIMITED_COPY
  }
  if (lower.includes('relay connection lost') || lower.includes('signaling')) {
    return SFU_SIGNALING_FAILED_COPY
  }
  if (lower.includes('publish') || lower.includes('relay denied') || lower.includes('video relay')) {
    return SFU_PUBLISH_REJECTED_COPY
  }
  return error
}
