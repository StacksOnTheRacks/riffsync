import type { TvFailureClass, TvPlaybackPath } from './tvClientIds'

export type TvDebugEventName =
  | 'tv_session_request'
  | 'tv_session_resolved'
  | 'tv_snapshot_sent'
  | 'tv_render_ack'
  | 'tv_render_timeout'
  | 'tv_render_failed'
  | 'tv_teardown'
  | 'tv_boot'
  | 'tv_link_snapshot'
  | 'tv_pairing_created'
  | 'tv_pairing_waiting'
  | 'tv_pairing_linked'
  | 'tv_pairing_claim'
  | 'tv_sfu_token'
  | 'tv_sfu_connected'
  | 'tv_first_frame'
  | 'tv_overlay_ready'
  | 'tv_playback_blocked'

export type TvDebugEventPayload = {
  tvClientSessionId?: string
  snapshotId?: string
  reason?: string
  playbackPath?: TvPlaybackPath
  failureClass?: TvFailureClass
}

/** Structured console events for Cast/TV diagnosis. Never log tokens, device names, or app ids. */
export function emitTvDebugEvent(name: TvDebugEventName, payload: TvDebugEventPayload = {}): void {
  const entry = {
    event: name,
    ...payload,
  }
  if (
    name === 'tv_render_failed' ||
    name === 'tv_render_timeout' ||
    name === 'tv_playback_blocked' ||
    payload.failureClass
  ) {
    console.error('[RiffSync TV]', entry)
    return
  }
  console.info('[RiffSync TV]', entry)
}
