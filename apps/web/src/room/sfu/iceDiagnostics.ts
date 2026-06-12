import { emitClientDrawerLog } from '../clientDrawerLog'
import { localDescriptionHasRelayCandidate } from './transportConnectivityDrawerLog'

export type IceCandidateSummary = {
  hasRelay: boolean
  hasSrflx: boolean
  hasHost: boolean
}

export function summarizeLocalIceCandidates(sdp: string): IceCandidateSummary {
  return {
    hasRelay: /\styp relay\b/i.test(sdp),
    hasSrflx: /\styp srflx\b/i.test(sdp),
    hasHost: /\styp host\b/i.test(sdp),
  }
}

/** One-shot probe after ICE gathering completes; logs candidate mix for drawer diagnostics. */
export function logIceCandidateSummary(pc: RTCPeerConnection): void {
  const sdp = pc.localDescription?.sdp ?? ''
  if (!sdp) return
  const summary = summarizeLocalIceCandidates(sdp)
  emitClientDrawerLog({
    drawer: 'connectivity',
    event: 'ice_candidate_summary',
    outcome: summary.hasRelay ? 'recovered' : 'retry',
    detail: JSON.stringify(summary),
  })
}

export async function probeTurnReachability(iceServers: RTCIceServer[]): Promise<boolean> {
  const needsTurn = iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
    return urls.some(
      (url) => typeof url === 'string' && (url.startsWith('turn:') || url.startsWith('turns:')),
    )
  })
  if (!needsTurn) return true

  const pc = new RTCPeerConnection({ iceServers })
  try {
    pc.createDataChannel('riffsync-turn-probe')
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve()
        return
      }
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', onChange)
          resolve()
        }
      }
      pc.addEventListener('icegatheringstatechange', onChange)
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', onChange)
        resolve()
      }, 3000)
    })
    const relayOk = localDescriptionHasRelayCandidate(pc)
    emitClientDrawerLog({
      drawer: 'connectivity',
      event: 'turn_reachability_probe',
      outcome: relayOk ? 'recovered' : 'failed',
      code: relayOk ? undefined : 'TURN_RELAY_REQUIRED',
    })
    return relayOk
  } finally {
    pc.close()
  }
}
