import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatSession, type ChatSessionStatus } from './sessions/ChatSession'

export type { ChatSessionStatus as WsStatus } from './sessions/ChatSession'

/**
 * Thin React adapter around {@link ChatSession}. Room control-plane WS lifecycle and
 * inbound demux live in the session class; this hook only binds connect params and status.
 */
export function useChatSession(options: {
  url: string | undefined
  roomId: string
  sessionId: string
  displayName?: string
  accessToken: string | null
  enabled: boolean
}): {
  status: ChatSessionStatus
  sendJson: (payload: Record<string, unknown>) => void
  session: ChatSession
} {
  const { url, roomId, sessionId, displayName, accessToken, enabled } = options
  const sessionRef = useRef<ChatSession | null>(null)
  if (!sessionRef.current) {
    sessionRef.current = new ChatSession()
  }
  const session = sessionRef.current
  const [status, setStatus] = useState<ChatSessionStatus>(() => session.getStatus())

  useEffect(() => {
    return session.onStatusChange(setStatus)
  }, [session])

  useEffect(() => {
    if (!enabled || !url) {
      session.disconnect()
      return () => session.disconnect()
    }
    session.connect({
      url,
      roomId,
      sessionId,
      displayName,
      accessToken,
      enabled: true,
    })
    return () => session.disconnect()
  }, [accessToken, displayName, enabled, roomId, session, sessionId, url])

  const sendJson = useCallback(
    (payload: Record<string, unknown>) => {
      session.send(payload)
    },
    [session],
  )

  return { status, sendJson, session }
}
