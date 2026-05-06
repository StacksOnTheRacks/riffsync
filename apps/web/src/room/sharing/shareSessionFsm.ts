/**
 * High-level UI / diagnostics state derived from **`RTCPeerConnection`** snapshots.
 *
 * ```mermaid
 * stateDiagram-v2
 *   idle --> negotiating_ice: pc_created
 *   negotiating_ice --> verifying_media: connected_or_ice_completed
 *   verifying_media --> running: live_tracks_stats
 *   negotiating_ice --> recovering_ice: disconnected_debounce
 *   recovering_ice --> negotiating_ice: ice_restart
 *   [*] --> failed: pc_failed_closed
 * ```
 */

export type ShareSessionFsm =
  | 'idle'
  | 'negotiating_ice'
  | 'verifying_media'
  | 'running'
  | 'recovering_ice'
  | 'failed'

export type PcFsmSnapshot = {
  exists: boolean
  connectionState: RTCPeerConnectionState | ''
  signalingState: RTCSignalingState | ''
  iceConnectionState: RTCIceConnectionState | ''
}

export function summarizePcForFsm(pc: RTCPeerConnection | null): PcFsmSnapshot {
  if (!pc || pc.signalingState === 'closed')
    return { exists: false, connectionState: '', signalingState: '', iceConnectionState: '' }
  return {
    exists: true,
    connectionState: pc.connectionState,
    signalingState: pc.signalingState,
    iceConnectionState: pc.iceConnectionState,
  }
}

export function deriveShareFsm(
  snapshot: PcFsmSnapshot,
  opts: {
    recoveringIce: boolean
    hasLiveRemoteVideo: boolean
    mediaVerified?: boolean | undefined
  },
): ShareSessionFsm {
  if (!snapshot.exists) return 'idle'
  if (snapshot.connectionState === 'failed' || snapshot.connectionState === 'closed') return 'failed'
  if (opts.recoveringIce) return 'recovering_ice'

  if (snapshot.connectionState === 'connected') {
    if (opts.mediaVerified === true) return 'running'
    if (opts.hasLiveRemoteVideo) return 'running'
    return 'verifying_media'
  }

  return 'negotiating_ice'
}
