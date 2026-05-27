/** Stick-to-bottom threshold for room chat log (see `.forge/interface/presentation.md`). */
export const CHAT_LOG_STICK_THRESHOLD_PX = 48

export type ChatLogScrollMetrics = Pick<HTMLElement, 'scrollTop' | 'clientHeight' | 'scrollHeight'>

export function isChatLogNearBottom(
  el: ChatLogScrollMetrics,
  thresholdPx: number = CHAT_LOG_STICK_THRESHOLD_PX,
): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - thresholdPx
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function chatLogScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth'
}

export function scrollChatLogToBottom(el: HTMLElement): void {
  el.scrollTo({ top: el.scrollHeight, behavior: chatLogScrollBehavior() })
}
