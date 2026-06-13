import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  countNewChatLines,
  jumpToLatestButtonLabel,
  nextPendingBelowCount,
  pendingCountAfterNearBottomScroll,
  shouldShowJumpToLatest,
} from './chatLogPending'
import { isChatLogNearBottom, scrollChatLogToBottom } from './chatLogScroll'

export type UseChatLogStickToBottomResult = {
  logRef: RefObject<HTMLUListElement | null>
  pendingBelowCount: number
  showJumpToLatest: boolean
  jumpToLatestLabel: string
  jumpToLatest: () => void
}

/**
 * Upper bound (ms) for a programmatic `behavior: 'smooth'` scroll-to-bottom to land.
 * While a programmatic scroll is animating, the browser emits `scroll` events whose
 * intermediate positions are not yet "near bottom"; we must not read those as the
 * user scrolling away. This timer is only a safety net for the case where the
 * scroll never actually moves (already at the bottom), so no `scroll` event fires.
 */
const PROGRAMMATIC_SCROLL_SETTLE_MS = 600

/**
 * Keeps the room chat log scrolled to the latest line when the user is near the bottom,
 * and tracks pending messages with a jump-to-latest affordance when scrolled up.
 */
export function useChatLogStickToBottom(
  chatLength: number,
  chatTabActive: boolean,
): UseChatLogStickToBottomResult {
  const logRef = useRef<HTMLUListElement>(null)
  const stickToBottomRef = useRef(true)
  const prevChatLengthRef = useRef(chatLength)
  // True while a programmatic scroll-to-bottom is still animating. During that
  // window the log is not yet "near bottom", but the user has not scrolled away
  // either, so stick-to-bottom must be preserved until the scroll lands.
  const programmaticScrollRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingBelowCount, setPendingBelowCount] = useState(0)
  const [isNearBottom, setIsNearBottom] = useState(true)

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }, [])

  const syncStickState = useCallback(() => {
    const el = logRef.current
    if (!el) return
    const near = isChatLogNearBottom(el)
    if (programmaticScrollRef.current) {
      // Ignore intermediate frames of our own smooth scroll. Only once the log
      // has actually reached the bottom do we resume reading user intent.
      if (!near) return
      programmaticScrollRef.current = false
      clearSettleTimer()
    }
    stickToBottomRef.current = near
    setIsNearBottom(near)
    setPendingBelowCount((pending) => pendingCountAfterNearBottomScroll(near, pending))
  }, [clearSettleTimer])

  const stickToBottomNow = useCallback(() => {
    const el = logRef.current
    if (!el) return
    programmaticScrollRef.current = true
    clearSettleTimer()
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null
      programmaticScrollRef.current = false
      syncStickState()
    }, PROGRAMMATIC_SCROLL_SETTLE_MS)
    scrollChatLogToBottom(el)
    stickToBottomRef.current = true
    setIsNearBottom(true)
    setPendingBelowCount(0)
  }, [clearSettleTimer, syncStickState])

  const jumpToLatest = useCallback(() => {
    stickToBottomNow()
  }, [stickToBottomNow])

  useLayoutEffect(() => {
    const el = logRef.current
    if (!el) return
    const onScroll = () => syncStickState()
    const onResize = () => syncStickState()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    syncStickState()
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [syncStickState])

  useLayoutEffect(() => {
    const prevLength = prevChatLengthRef.current
    const newLines = countNewChatLines(prevLength, chatLength)
    prevChatLengthRef.current = chatLength

    if (newLines > 0) {
      const wasNearBottom = stickToBottomRef.current
      setPendingBelowCount((pending) => nextPendingBelowCount(pending, newLines, wasNearBottom))
    }
  }, [chatLength])

  useLayoutEffect(() => {
    if (!chatTabActive) return
    const el = logRef.current
    if (!el) return
    if (stickToBottomRef.current) {
      // Pin to the new bottom. Assert the stuck state instead of re-measuring,
      // because a smooth scroll has not updated `scrollTop` yet on this frame.
      stickToBottomNow()
    } else {
      syncStickState()
    }
  }, [chatLength, chatTabActive, stickToBottomNow, syncStickState])

  useEffect(() => clearSettleTimer, [clearSettleTimer])

  const showJumpToLatest = chatTabActive && shouldShowJumpToLatest(pendingBelowCount, isNearBottom)

  return {
    logRef,
    pendingBelowCount,
    showJumpToLatest,
    jumpToLatestLabel: jumpToLatestButtonLabel(pendingBelowCount),
    jumpToLatest,
  }
}
