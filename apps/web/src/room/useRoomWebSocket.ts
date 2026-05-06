import { useCallback, useEffect, useRef, useState } from 'react'
import {
  recordInboundWsMessage,
  recordOutboundDropped,
  recordOutboundSent,
  recordWsClose,
  recordWsConnectAttempt,
  recordWsErrorEvent,
  recordWsOpen,
} from './realtimeDiagnostics'
import { webrtcDebugEnabled, webrtcLog } from './webrtcDebug'

const PING_MS = 25_000

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export function useRoomWebSocket(options: {
  url: string | undefined
  roomId: string
  sessionId: string
  /** Shown in room “People” list when the server broadcasts presence (bounded to 48 chars on connect). */
  displayName?: string
  accessToken: string | null
  enabled: boolean
  onMessage: (data: Record<string, unknown>) => void
}): {
  status: WsStatus
  sendJson: (payload: Record<string, unknown>) => void
} {
  const { url, roomId, sessionId, displayName, accessToken, enabled, onMessage } = options
  const enabledRef = useRef(enabled)
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const backoffRef = useRef(1000)
  const reconnectTimerRef = useRef<number | null>(null)
  const [status, setStatus] = useState<WsStatus>('idle')
  const onMessageRef = useRef(onMessage)

  /** `accessToken` is in the connect effect deps on purpose — when Cognito rotates the JWT the socket reconnects as publisher. */

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
      if (displayName && displayName.trim() !== '') {
        qp.set('displayName', displayName.trim().slice(0, 48))
      }
      if (accessToken) {
        qp.set('accessToken', accessToken)
      }
      const wsUrlBase = `${url}?${qp.toString()}`
      recordWsConnectAttempt(wsUrlBase, Boolean(accessToken))
      if (webrtcDebugEnabled()) {
        webrtcLog('ws opening', {
          urlChars: wsUrlBase.length,
          hasAccessToken: Boolean(accessToken),
          socketRole: accessToken ? 'publisher (JWT on query)' : 'guest/anonymous (expected)',
        })
      }
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
        recordWsOpen()
        if (webrtcDebugEnabled()) webrtcLog('ws open')
        const ping = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }))
          }
        }
        ping()
        pingRef.current = setInterval(ping, PING_MS)
      })

      ws.addEventListener('message', (ev) => {
        recordInboundWsMessage(String(ev.data))
        try {
          const data = JSON.parse(String(ev.data)) as Record<string, unknown>
          onMessageRef.current(data)
        } catch {
          /* ignore malformed */
        }
      })

      ws.addEventListener('close', (ev) => {
        clearPing()
        wsRef.current = null
        recordWsClose(ev.code, ev.reason !== '' ? ev.reason : undefined)
        if (!cancelled && webrtcDebugEnabled()) {
          webrtcLog('ws close', {
            code: ev.code,
            reason: typeof ev.reason === 'string' && ev.reason !== '' ? ev.reason : undefined,
          })
        }
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
        if (!cancelled) recordWsErrorEvent()
        if (!cancelled && webrtcDebugEnabled()) webrtcLog('ws error event')
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
  }, [accessToken, displayName, enabled, roomId, sessionId, url])

  const sendJson = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      recordOutboundDropped(payload, ws?.readyState ?? -1)
      return
    }
    recordOutboundSent(payload)
    ws.send(JSON.stringify(payload))
  }, [])

  return { status, sendJson }
}
