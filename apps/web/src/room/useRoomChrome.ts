import { useContext } from 'react'
import { RoomChromeContext, type RoomChromeContextValue } from './roomChromeContext'

export function useRoomChrome(): RoomChromeContextValue {
  const ctx = useContext(RoomChromeContext)
  if (!ctx) {
    throw new Error('useRoomChrome must be used within RoomChromeProvider')
  }
  return ctx
}

/** Safe for SiteHeader when provider may not wrap party-capture bare layout. */
export function useRoomChromeOptional(): RoomChromeContextValue | null {
  return useContext(RoomChromeContext)
}
