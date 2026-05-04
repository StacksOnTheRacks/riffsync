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

export function summarizeEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
  const kind = envelope.kind
  const guest = envelope.guestSignaling === true
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
  pc.addEventListener('iceconnectionstatechange', () => log('iceconnectionstatechange'))
  pc.addEventListener('icegatheringstatechange', () => log('icegatheringstatechange'))
  pc.addEventListener('signalingstatechange', () => log('signalingstatechange'))
}
