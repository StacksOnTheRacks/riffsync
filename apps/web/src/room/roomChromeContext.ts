import { createContext } from 'react'

export type RoomChromeContextValue = {
  nowPlayingLabel: string | null
  setNowPlayingLabel: (label: string | null) => void
  expandedViewActive: boolean
  setExpandedViewActive: (active: boolean) => void
}

export const RoomChromeContext = createContext<RoomChromeContextValue | null>(null)
