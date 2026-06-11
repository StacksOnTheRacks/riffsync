/** Guest host-screen attach FSM labels for the video-relay status surface. */
export type GuestHostScreenFsm = 'idle' | 'verifying_media' | 'running'

/**
 * Video-relay drawer status for guests. Configuration-class SFU errors persist here
 * (and in the page alert) until signaling `session.ready` clears them.
 */
export function resolveGuestVideoRelayStatusLine(opts: {
  sfuRelayError: string | null
  guestShareFsm: GuestHostScreenFsm
  chatWsDisconnected: boolean
}): string | null {
  if (opts.sfuRelayError) return opts.sfuRelayError
  if (opts.chatWsDisconnected) return 'Reconnecting chat… Video may pause briefly.'
  switch (opts.guestShareFsm) {
    case 'idle':
      return 'Waiting for host to share…'
    case 'verifying_media':
      return 'Connecting to video relay…'
    case 'running':
      return null
    default:
      return null
  }
}

/** Host video-relay status mirrors config-class errors; transient states stay in capture chrome. */
export function resolveHostVideoRelayStatusLine(sfuRelayError: string | null): string | null {
  return sfuRelayError
}
