import { useEffect, useRef, useState } from 'react'
import type { RoomMode } from '../../api/roomsApi'

const LAYOUT_STABLE_MS = 400
const LAYOUT_MAX_MS = 3000

export function useStageLayoutTransition(roomMode: RoomMode, videoTileCount: number): boolean {
  const [updating, setUpdating] = useState(false)
  const prevModeRef = useRef(roomMode)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (prevModeRef.current === roomMode) return
    prevModeRef.current = roomMode
    setUpdating(true)
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current)
    maxTimerRef.current = setTimeout(() => {
      maxTimerRef.current = null
      setUpdating(false)
    }, LAYOUT_MAX_MS)
    return () => {
      if (maxTimerRef.current) {
        clearTimeout(maxTimerRef.current)
        maxTimerRef.current = null
      }
    }
  }, [roomMode])

  useEffect(() => {
    if (!updating) return
    if (stableTimerRef.current) clearTimeout(stableTimerRef.current)
    stableTimerRef.current = setTimeout(() => {
      stableTimerRef.current = null
      setUpdating(false)
      if (maxTimerRef.current) {
        clearTimeout(maxTimerRef.current)
        maxTimerRef.current = null
      }
    }, LAYOUT_STABLE_MS)
    return () => {
      if (stableTimerRef.current) {
        clearTimeout(stableTimerRef.current)
        stableTimerRef.current = null
      }
    }
  }, [updating, videoTileCount, roomMode])

  return updating
}
