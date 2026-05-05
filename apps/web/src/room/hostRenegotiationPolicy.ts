/**
 * Host peer: whether a duplicate guest `ready` or flush should skip tearing down the PC.
 * Closing/re-offering while `have-local-offer` or mid-ICE races the guest answer.
 */
export type HostPcRenegotiationSnapshot = {
  signalingState: RTCSignalingState
  connectionState: RTCPeerConnectionState
  hasRemoteDescription: boolean
}

export function hostShouldSkipRenegotiation(pc: HostPcRenegotiationSnapshot): boolean {
  if (pc.signalingState === 'closed') return false
  if (pc.signalingState === 'have-local-offer') return true
  if (pc.signalingState === 'stable' && pc.hasRemoteDescription) {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') return false
    return true
  }
  return false
}
