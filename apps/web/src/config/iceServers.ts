/** RTCPeerConnection ICE config from env or public STUN fallback. */
export function getRtcIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS_JSON?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) {
        throw new Error('iceServers must be a JSON array')
      }
      return parsed as RTCIceServer[]
    } catch {
      console.warn('[riffsync] VITE_WEBRTC_ICE_SERVERS_JSON invalid; using default STUN')
    }
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }]
}
