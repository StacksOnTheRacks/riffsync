import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { RoomChromeContext } from './roomChromeContext'

export function RoomChromeProvider({ children }: { children: ReactNode }) {
  const [nowPlayingLabel, setNowPlayingLabelState] = useState<string | null>(null)
  const [expandedViewActive, setExpandedViewActiveState] = useState(false)
  const setNowPlayingLabel = useCallback((label: string | null) => {
    setNowPlayingLabelState(label)
  }, [])
  const setExpandedViewActive = useCallback((active: boolean) => {
    setExpandedViewActiveState(active)
  }, [])

  const value = useMemo(
    () => ({ nowPlayingLabel, setNowPlayingLabel, expandedViewActive, setExpandedViewActive }),
    [nowPlayingLabel, setNowPlayingLabel, expandedViewActive, setExpandedViewActive],
  )

  return <RoomChromeContext.Provider value={value}>{children}</RoomChromeContext.Provider>
}
