/** Enable with **`?webrtcDebug=1`** on the room URL (sessionStorage remembers for that tab). */
const KEY = 'riffsync.webrtcDebug'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function webrtcDebugEnabled(): boolean {
  try {
    if (sessionStorage.getItem(KEY) === '1') return true
    const v = new URLSearchParams(window.location.search).get('webrtcDebug')
    if (v === '1' || v === 'true') {
      sessionStorage.setItem(KEY, '1')
      return true
    }
  } catch {
    /* private mode, etc. */
  }
  return false
}

export function webrtcLog(...args: unknown[]): void {
  if (!webrtcDebugEnabled()) return
  console.info('[riffsync-webrtc]', ...args)
}

export function announceWebrtcDebugOnRoomMount(): void {
  if (!webrtcDebugEnabled()) return
  console.info(
    '[riffsync-webrtc] Verbose signaling enabled for this tab. If you expected logs but see none, add ?webrtcDebug=1 to the room URL and reload. Disable: sessionStorage.removeItem("riffsync.webrtcDebug")',
  )
}

export function summarizeEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
  const kind = envelope.kind
  const guest = envelope.guestSignaling === true
  if (kind === 'ready') {
    return {
      kind,
      guestSignaling: guest,
      hint: 'guest ping — SDP/ICE appear only on host offer + guest answer / trickle',
    }
  }
  const sdp = envelope.sdp
  const sdpLen = typeof (sdp as { sdp?: string })?.sdp === 'string' ? (sdp as { sdp: string }).sdp.length : 0
  const target =
    typeof envelope.targetSessionId === 'string'
      ? `${(envelope.targetSessionId as string).slice(0, 8)}…`
      : undefined
  const cand = envelope.candidate
  const iceOk = kind === 'ice' && isRecord(cand) && typeof cand.candidate === 'string'
  return {
    kind,
    guestSignaling: guest,
    sdpChars: sdpLen || undefined,
    targetSessionId: target,
    iceCandidate: kind === 'ice' ? iceOk : undefined,
  }
}

export function attachPcStateLogging(pc: RTCPeerConnection, label: string): void {
  const log = (ev: string) => {
    if (!webrtcDebugEnabled()) return
    webrtcLog(label, ev, {
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState,
    })
  }
  log('created')
  pc.addEventListener('connectionstatechange', () => log('connectionstatechange'))
  pc.addEventListener('iceconnectionstatechange', () => {
    log('iceconnectionstatechange')
    if (webrtcDebugEnabled() && pc.iceConnectionState === 'failed') {
      webrtcLog(
        label,
        'ICE failed — restrictive NAT/firewalls need TURN (`GET /v1/webrtc/ice` when API URL set, else `VITE_WEBRTC_ICE_SERVERS_JSON` — see apps/web/.env.example).',
      )
    }
  })
  pc.addEventListener('icegatheringstatechange', () => log('icegatheringstatechange'))
  pc.addEventListener('signalingstatechange', () => log('signalingstatechange'))
}
