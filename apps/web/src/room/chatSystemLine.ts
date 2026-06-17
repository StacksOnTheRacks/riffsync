export type ChatSystemKind = 'join' | 'leave'

export type ChatSystemLine = {
  kind: 'system'
  messageId: string
  sessionId: string
  displayName: string
  systemEvent: ChatSystemKind
  ts: number
}

export function formatChatSystemText(displayName: string, systemEvent: ChatSystemKind): string {
  return systemEvent === 'join' ? `${displayName} joined` : `${displayName} left`
}

export function buildChatSystemLine(params: {
  sessionId: string
  displayName: string
  systemEvent: ChatSystemKind
  ts: number
}): ChatSystemLine {
  return {
    kind: 'system',
    messageId: `system:${params.sessionId}:${params.ts}`,
    sessionId: params.sessionId,
    displayName: params.displayName,
    systemEvent: params.systemEvent,
    ts: params.ts,
  }
}
