import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { RoomChromeContext } from './roomChromeContext'

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
