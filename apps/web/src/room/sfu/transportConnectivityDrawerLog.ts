import type { Transport } from 'mediasoup-client/types'
import { emitClientDrawerLog } from '../clientDrawerLog'
import { ICE_DISCONNECTED_FAILURE_MS } from '../realtimeDrawerErrors'
import { webrtcDebugEnabled, webrtcLog } from '../webrtcDebug'
import { logIceCandidateSummary, summarizeLocalIceCandidates } from './iceDiagnostics'

export type TransportConnectivityHealthState =
  | 'connected'
  | 'reconnecting'
  | 'degraded'
  | 'torn-down'

export type TransportConnectivityHealthSnapshot = {
  state: TransportConnectivityHealthState
  lastErrorCode?: 'ICE_FAILED' | 'TURN_RELAY_REQUIRED'
  iceConnectionState?: RTCIceConnectionState
}

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
  onHealthChange?: (snapshot: TransportConnectivityHealthSnapshot) => void,
): () => void {
  const pc = resolvePeerConnectionFromTransport(transport)
  if (!pc) return () => undefined

  const turnRequired = iceServersRequireTurn(iceServers)
  let disconnectedTimer: ReturnType<typeof setTimeout> | null = null
  let connectivityDegraded = false
  let turnRelayLogged = false
  let gatheredRelayCandidate = false
  let gatheringCompletedWithoutRelay = false

  const clearDisconnectedTimer = () => {
    if (disconnectedTimer !== null) {
      clearTimeout(disconnectedTimer)
      disconnectedTimer = null
    }
  }

  const emitHealth = (
    state: TransportConnectivityHealthState,
    lastErrorCode?: TransportConnectivityHealthSnapshot['lastErrorCode'],
  ) => {
    onHealthChange?.({
      state,
      ...(lastErrorCode ? { lastErrorCode } : {}),
      iceConnectionState: pc.iceConnectionState,
    })
  }

  const emitIceFailed = () => {
    connectivityDegraded = true
    emitHealth('degraded', 'ICE_FAILED')
    emitClientDrawerLog({
      drawer: 'connectivity',
      event: 'ice_failed',
      code: 'ICE_FAILED',
      outcome: 'failed',
    })
    // Only now is a missing relay candidate actionable: ICE failed and there was no relay to
    // fall back on. Emitting at gather-complete instead cried wolf on every healthy client that
    // connected directly (host/srflx) to the public SFU and never needed a relay candidate.
    if (turnRequired && gatheringCompletedWithoutRelay && !gatheredRelayCandidate) {
      emitTurnRelayRequired()
    }
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
    emitHealth('degraded', 'TURN_RELAY_REQUIRED')
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
    emitHealth('connected')
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
      emitHealth('connected')
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
      emitHealth('reconnecting')
      disconnectedTimer = setTimeout(() => {
        disconnectedTimer = null
        const cur = pc.iceConnectionState
        if (cur === 'disconnected' || cur === 'failed') {
          emitIceFailed()
        }
      }, ICE_DISCONNECTED_FAILURE_MS)
      return
    }
    if (state === 'checking') {
      emitHealth('reconnecting')
      return
    }
    if (state === 'closed') {
      emitHealth('torn-down')
    }
  }

  const onIceGatheringStateChange = () => {
    if (pc.iceGatheringState !== 'complete') return
    logIceCandidateSummary(pc)
    const summary = summarizeLocalIceCandidates(pc.localDescription?.sdp ?? '')
    if (summary.hasRelay) {
      gatheredRelayCandidate = true
      emitClientDrawerLog({
        drawer: 'connectivity',
        event: 'ice_relay_candidate',
        outcome: 'recovered',
      })
    }
    if (!turnRequired) return
    // Record (do not log) that gathering finished without a relay candidate. Whether this is a
    // problem depends on the eventual ICE result, handled in emitIceFailed.
    if (!localDescriptionHasRelayCandidate(pc)) {
      gatheringCompletedWithoutRelay = true
    }
  }

  pc.addEventListener('iceconnectionstatechange', onIceConnectionStateChange)
  pc.addEventListener('icegatheringstatechange', onIceGatheringStateChange)
  onIceConnectionStateChange()

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
    onHealthChange?.({ state: 'torn-down', iceConnectionState: 'closed' })
  }
}
