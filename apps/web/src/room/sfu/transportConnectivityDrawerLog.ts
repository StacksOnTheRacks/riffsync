import type { Transport } from 'mediasoup-client/types'
import { emitClientDrawerLog } from '../clientDrawerLog'
import { ICE_DISCONNECTED_FAILURE_MS } from '../realtimeDrawerErrors'
import { webrtcDebugEnabled, webrtcLog } from '../webrtcDebug'
import { logIceCandidateSummary, summarizeLocalIceCandidates } from './iceDiagnostics'

type TransportWithHandler = {
  _handler?: { _pc?: RTCPeerConnection }
}

export function resolvePeerConnectionFromTransport(
  transport: Transport,
): RTCPeerConnection | null {
  const handler = (transport as unknown as TransportWithHandler)._handler
  return handler?._pc ?? null
}

export function iceServersRequireTurn(iceServers: RTCIceServer[]): boolean {
  for (const server of iceServers) {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
    for (const url of urls) {
      if (typeof url === 'string' && (url.startsWith('turn:') || url.startsWith('turns:'))) {
        return true
      }
    }
  }
  return false
}

export function localDescriptionHasRelayCandidate(pc: RTCPeerConnection): boolean {
  const sdp = pc.localDescription?.sdp ?? ''
  return /\styp relay\b/i.test(sdp)
}

/** Production connectivity drawer logs on mediasoup transport RTCPeerConnection hooks. */
export function attachTransportConnectivityDrawerLog(
  transport: Transport,
  iceServers: RTCIceServer[],
): () => void {
  const pc = resolvePeerConnectionFromTransport(transport)
  if (!pc) return () => undefined

  const turnRequired = iceServersRequireTurn(iceServers)
  let disconnectedTimer: ReturnType<typeof setTimeout> | null = null
  let connectivityDegraded = false
  let turnRelayLogged = false

  const clearDisconnectedTimer = () => {
    if (disconnectedTimer !== null) {
      clearTimeout(disconnectedTimer)
      disconnectedTimer = null
    }
  }

  const emitIceFailed = () => {
    connectivityDegraded = true
    emitClientDrawerLog({
      drawer: 'connectivity',
      event: 'ice_failed',
      code: 'ICE_FAILED',
      outcome: 'failed',
    })
    if (webrtcDebugEnabled()) {
      webrtcLog(
        'transport',
        'ICE failed — restrictive NAT/firewalls need TURN (`GET /v1/webrtc/ice` when API URL set, else `VITE_WEBRTC_ICE_SERVERS_JSON` — see apps/web/.env.example).',
      )
    }
  }

  const emitTurnRelayRequired = () => {
    if (turnRelayLogged) return
    turnRelayLogged = true
    emitClientDrawerLog({
      drawer: 'connectivity',
      event: 'turn_relay_required',
      code: 'TURN_RELAY_REQUIRED',
      outcome: 'failed',
    })
  }

  const emitIceRecovered = () => {
    if (!connectivityDegraded) return
    connectivityDegraded = false
    emitClientDrawerLog({
      drawer: 'connectivity',
      event: 'ice_recovered',
      outcome: 'recovered',
    })
  }

  const onIceConnectionStateChange = () => {
    const state = pc.iceConnectionState
    if (state === 'connected' || state === 'completed') {
      clearDisconnectedTimer()
      emitIceRecovered()
      return
    }
    if (state === 'failed') {
      clearDisconnectedTimer()
      emitIceFailed()
      return
    }
    if (state === 'disconnected') {
      clearDisconnectedTimer()
      disconnectedTimer = setTimeout(() => {
        disconnectedTimer = null
        const cur = pc.iceConnectionState
        if (cur === 'disconnected' || cur === 'failed') {
          emitIceFailed()
        }
      }, ICE_DISCONNECTED_FAILURE_MS)
    }
  }

  const onIceGatheringStateChange = () => {
    if (pc.iceGatheringState !== 'complete') return
    logIceCandidateSummary(pc)
    const summary = summarizeLocalIceCandidates(pc.localDescription?.sdp ?? '')
    if (summary.hasRelay) {
      emitClientDrawerLog({
        drawer: 'connectivity',
        event: 'ice_relay_candidate',
        outcome: 'recovered',
      })
    }
    if (!turnRequired) return
    if (!localDescriptionHasRelayCandidate(pc)) {
      emitTurnRelayRequired()
    }
  }

  pc.addEventListener('iceconnectionstatechange', onIceConnectionStateChange)
  pc.addEventListener('icegatheringstatechange', onIceGatheringStateChange)

  if (webrtcDebugEnabled()) {
    const logState = (ev: string) => {
      webrtcLog('transport', ev, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState,
      })
    }
    pc.addEventListener('connectionstatechange', () => logState('connectionstatechange'))
    logState('connectivity hooks attached')
  }

  return () => {
    clearDisconnectedTimer()
    pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange)
    pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange)
  }
}
