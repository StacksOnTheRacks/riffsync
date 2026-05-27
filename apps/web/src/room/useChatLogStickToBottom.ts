import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import { isChatLogNearBottom, scrollChatLogToBottom } from './chatLogScroll'

/**
 * Keeps the room chat log scrolled to the latest line when the user is near the bottom.
 * Only runs while the Chat tab is active.
 */
export function useChatLogStickToBottom(
  chatLength: number,
  chatTabActive: boolean,
): RefObject<HTMLUListElement | null> {
  const logRef = useRef<HTMLUListElement>(null)
  const stickToBottomRef = useRef(true)

  const syncStickState = useCallback(() => {
    const el = logRef.current
    if (!el) return
    stickToBottomRef.current = isChatLogNearBottom(el)
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
    if (!chatTabActive) return
    const el = logRef.current
    if (!el) return
    syncStickState()
    if (stickToBottomRef.current) {
      scrollChatLogToBottom(el)
    }
  }, [chatLength, chatTabActive, syncStickState])

  return logRef
}
