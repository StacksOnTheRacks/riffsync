import { useEffect } from 'react'
import { installFanDmSessionAuthListener } from './FanDmSession'

/**
 * Opens the Fan DM push WebSocket when a signed-in fan session is present.
 * Independent of room ChatSession / SFU lifecycle.
 */
export function FanDmSessionKeepAlive() {
  useEffect(() => installFanDmSessionAuthListener(), [])
  return null
}
