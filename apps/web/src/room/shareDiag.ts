/**
 * Sampling **`getStats()`** for coarse **media-health** gates (guest inbound video).
 */

export type InboundVideoHealth = {
  bytesReceived?: number
  framesDecoded?: number
  framesReceived?: number
  jitter?: number
  packetsLost?: number
}

export async function collectInboundVideoHealth(pc: RTCPeerConnection | null): Promise<InboundVideoHealth> {
  const out: InboundVideoHealth = {}
  if (!pc || pc.connectionState === 'closed') return out
  try {
    const stats = await pc.getStats()
    stats.forEach((s) => {
      if (
        typeof s !== 'object' ||
        !('type' in s && s.type === 'inbound-rtp') ||
        !('kind' in s && s.kind === 'video')
      )
        return
      type R = RTCInboundRtpStreamStats &
        RTCReceivedRtpStreamStats & { framesDecoded?: number; framesReceived?: number }
      const rs = s as unknown as R
      if (typeof rs.bytesReceived === 'number') out.bytesReceived = rs.bytesReceived
      if (typeof rs.framesDecoded === 'number') out.framesDecoded = rs.framesDecoded
      if (typeof rs.framesReceived === 'number') out.framesReceived = rs.framesReceived
      if (typeof rs.jitter === 'number') out.jitter = rs.jitter
      if ('packetsLost' in rs && typeof rs.packetsLost === 'number') out.packetsLost = rs.packetsLost
    })
  } catch {
    /* ignore */
  }
  return out
}

export async function summarizePeerPcLite(pc: RTCPeerConnection): Promise<{
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  signalingState: RTCSignalingState
  iceGatheringState: RTCIceGatheringState
}> {
  return {
    connectionState: pc.connectionState,
    iceConnectionState: pc.iceConnectionState,
    signalingState: pc.signalingState,
    iceGatheringState: pc.iceGatheringState,
  }
}
