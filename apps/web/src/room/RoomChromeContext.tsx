import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type RoomChromeContextValue = {
  nowPlayingLabel: string | null
  setNowPlayingLabel: (label: string | null) => void
}

const RoomChromeContext = createContext<RoomChromeContextValue | null>(null)

export function RoomChromeProvider({ children }: { children: ReactNode }) {
  const [nowPlayingLabel, setNowPlayingLabelState] = useState<string | null>(null)
  const setNowPlayingLabel = useCallback((label: string | null) => {
    setNowPlayingLabelState(label)
  }, [])

  const value = useMemo(
    () => ({ nowPlayingLabel, setNowPlayingLabel }),
    [nowPlayingLabel, setNowPlayingLabel],
  )

  return <RoomChromeContext.Provider value={value}>{children}</RoomChromeContext.Provider>
}

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
