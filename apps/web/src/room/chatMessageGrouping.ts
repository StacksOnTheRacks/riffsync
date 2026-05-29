export function isContinuedChatLine<T extends { sessionId: string }>(
  lines: readonly T[],
  index: number,
): boolean {
  if (index <= 0) return false
  return lines[index - 1]!.sessionId === lines[index]!.sessionId
}
