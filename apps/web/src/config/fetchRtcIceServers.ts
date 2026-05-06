import { getPublicApiBaseUrl } from './apiBaseUrl'
import { getRtcIceServers } from './iceServers'

const ICE_PATH = '/v1/webrtc/ice'

function parseIceResponse(json: unknown): RTCIceServer[] | null {
  if (Array.isArray(json)) {
    return json.length > 0 ? (json as RTCIceServer[]) : null
  }
  if (json && typeof json === 'object' && 'iceServers' in json) {
    const v = (json as { iceServers: unknown }).iceServers
    if (Array.isArray(v) && v.length > 0) {
      return v as RTCIceServer[]
    }
  }
  return null
}

/**
 * Load `iceServers` from **`GET /v1/webrtc/ice`** when **`VITE_PUBLIC_API_BASE_URL`** is set;
 * otherwise use [getRtcIceServers] (env JSON or public STUN fallback).
 */
export async function fetchRtcIceServers(): Promise<RTCIceServer[]> {
  const base = getPublicApiBaseUrl()
  if (!base) return getRtcIceServers()
  try {
    const res = await fetch(`${base}${ICE_PATH}`, { credentials: 'omit' })
    if (!res.ok) return getRtcIceServers()
    const json: unknown = await res.json()
    const parsed = parseIceResponse(json)
    return parsed ?? getRtcIceServers()
  } catch {
    return getRtcIceServers()
  }
}
