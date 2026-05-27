import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
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
  const [pendingBelowCount, setPendingBelowCount] = useState(0)
  const [isNearBottom, setIsNearBottom] = useState(true)

  const syncStickState = useCallback(() => {
    const el = logRef.current
    if (!el) return
    const near = isChatLogNearBottom(el)
    stickToBottomRef.current = near
    setIsNearBottom(near)
    setPendingBelowCount((pending) => pendingCountAfterNearBottomScroll(near, pending))
  }, [])

  const jumpToLatest = useCallback(() => {
    const el = logRef.current
    if (!el) return
    scrollChatLogToBottom(el)
    stickToBottomRef.current = true
    setIsNearBottom(true)
    setPendingBelowCount(0)
  }, [])

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
    const shouldStick = stickToBottomRef.current
    if (shouldStick) {
      scrollChatLogToBottom(el)
    }
    syncStickState()
  }, [chatLength, chatTabActive, syncStickState])

  const showJumpToLatest = chatTabActive && shouldShowJumpToLatest(pendingBelowCount, isNearBottom)

  return {
    logRef,
    pendingBelowCount,
    showJumpToLatest,
    jumpToLatestLabel: jumpToLatestButtonLabel(pendingBelowCount),
    jumpToLatest,
  }
}
