import { useCallback, useEffect, useRef, useState } from 'react'

const PING_MS = 25_000

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export function useRoomWebSocket(options: {
  url: string | undefined
  roomId: string
  sessionId: string
  accessToken: string | null
  enabled: boolean
  onMessage: (data: Record<string, unknown>) => void
}): {
  status: WsStatus
  sendJson: (payload: Record<string, unknown>) => void
} {
  const { url, roomId, sessionId, accessToken, enabled, onMessage } = options
  const enabledRef = useRef(enabled)
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const backoffRef = useRef(1000)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<WsStatus>('idle')
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  const clearPing = () => {
    if (pingRef.current) {
      clearInterval(pingRef.current)
      pingRef.current = null
    }
  }

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }

  useEffect(() => {
    if (!enabled || !url) {
      clearPing()
      clearReconnectTimer()
      wsRef.current?.close()
      wsRef.current = null
      queueMicrotask(() => setStatus('idle'))
      return
    }

    let cancelled = false

    const openWs = (): void => {
      if (cancelled || !enabledRef.current) return

      clearPing()
      clearReconnectTimer()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      queueMicrotask(() => setStatus('connecting'))

      const qp = new URLSearchParams({ roomId, sessionId })
      if (accessToken) {
        qp.set('accessToken', accessToken)
      }
      const wsUrlBase = `${url}?${qp.toString()}`
      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrlBase)
      } catch {
        queueMicrotask(() => setStatus('error'))
        return
      }
      wsRef.current = ws

      ws.addEventListener('open', () => {
        if (cancelled) return
        backoffRef.current = 1000
        setStatus('open')
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }))
          }
        }, PING_MS)
      })

      ws.addEventListener('message', (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as Record<string, unknown>
          onMessageRef.current(data)
        } catch {
          /* ignore malformed */
        }
      })

      ws.addEventListener('close', () => {
        clearPing()
        wsRef.current = null
        if (cancelled) return
        queueMicrotask(() => setStatus('closed'))
        if (!enabledRef.current) return
        const delay = Math.min(backoffRef.current, 60_000)
        backoffRef.current = Math.min(backoffRef.current * 2, 60_000)
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null
          openWs()
        }, delay)
      })

      ws.addEventListener('error', () => {
        if (!cancelled) queueMicrotask(() => setStatus('error'))
      })
    }

    backoffRef.current = 1000
    openWs()

    return () => {
      cancelled = true
      clearPing()
      clearReconnectTimer()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [accessToken, enabled, roomId, sessionId, url])

  const sendJson = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
    }
  }, [])

  return { status, sendJson }
}
