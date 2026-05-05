/**
 * Host peer: whether a duplicate guest `ready` or flush should skip tearing down the PC.
 * Closing/re-offering while `have-local-offer` races the guest answer.
 *
 * Once SDP is paired (`stable` + remote answer), we still **must not** skip while
 * `connectionState` is stuck at `connecting` / `checking` — otherwise guests that fail ICE
 * (NAT, no relay) never get a fresh offer when they ping `ready` every ~8s.
 * Only skip when the media path is actually **`connected`**.
 */
export type HostPcRenegotiationSnapshot = {
  signalingState: RTCSignalingState
  connectionState: RTCPeerConnectionState
  hasRemoteDescription: boolean
}

export function hostShouldSkipRenegotiation(pc: HostPcRenegotiationSnapshot): boolean {
  if (pc.signalingState === 'closed') return false
  if (pc.signalingState === 'have-local-offer') return true
  if (
    pc.signalingState === 'stable' &&
    pc.hasRemoteDescription &&
    pc.connectionState === 'connected'
  ) {
    return true
  }
  return false
}
