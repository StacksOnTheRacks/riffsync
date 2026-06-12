import { useChatSession } from './useChatSession'
import type { ChatSessionStatus } from './sessions/ChatSession'

export type WsStatus = ChatSessionStatus

/**
 * @deprecated Prefer {@link useChatSession} with {@link ChatSession} event subscriptions.
 * Retained as a thin React adapter for legacy call sites that only need status + send.
 */
export function useRoomWebSocket(options: {
  url: string | undefined
  roomId: string
  sessionId: string
  displayName?: string
  accessToken: string | null
  enabled: boolean
  /** Ignored — subscribe on {@link useChatSession}'s `session` instead. */
  onMessage?: (data: Record<string, unknown>) => void
}): {
  status: WsStatus
  sendJson: (payload: Record<string, unknown>) => boolean
} {
  const { url, roomId, sessionId, displayName, accessToken, enabled } = options
  const { status, sendJson } = useChatSession({
    url,
    roomId,
    sessionId,
    displayName,
    accessToken,
    enabled,
  })
  return { status, sendJson }
}
