/** Count inbound chat lines added in a single update (ignores shrink/clear). */
export function countNewChatLines(prevLength: number, nextLength: number): number {
  const delta = nextLength - prevLength
  return delta > 0 ? delta : 0
}

/** Pending lines below the viewport when the user is reading history. */
export function nextPendingBelowCount(
  currentPending: number,
  newLineCount: number,
  wasNearBottom: boolean,
): number {
  if (newLineCount <= 0) return currentPending
  if (wasNearBottom) return 0
  return currentPending + newLineCount
}

/** Clears pending when the user scrolls back within the stick threshold. */
export function pendingCountAfterNearBottomScroll(
  wasNearBottom: boolean,
  currentPending: number,
): number {
  return wasNearBottom ? 0 : currentPending
}

export function jumpToLatestButtonLabel(pendingCount: number): string {
  if (pendingCount <= 1) return 'New messages'
  return `New messages (${pendingCount})`
}

export function shouldShowJumpToLatest(pendingCount: number, isNearBottom: boolean): boolean {
  return pendingCount > 0 && !isNearBottom
}
