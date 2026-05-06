/**
 * Host peer: whether a duplicate guest `ready` or flush should skip tearing down the PC.
 * Closing/re-offering while `have-local-offer` races the guest answer.
 *
 * Guests send `ready` every ~2.5s until they have live remote tracks. If we tear down the host
 * PC whenever `connectionState !== 'connected'` after SDP is paired, those pings arrive **during
 * normal ICE** (`connecting` / transient `new`) and constantly reset negotiation — ICE never
 * settles and both sides log repeating gathering/connecting.
 *
 * After the guest answer is applied (`stable` + remote description), skip teardown unless the
 * peer is **`failed`** or **`disconnected`** so a fresh offer can recover.
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
    pc.connectionState !== 'failed' &&
    pc.connectionState !== 'disconnected'
  ) {
    return true
  }
  return false
}
