import { WebSocketServer, type WebSocket } from 'ws'
import { HARNESS_ROOM_ID } from './harness-constants.js'

export type RoomWsStubHandle = {
  url: string
  port: number
  forceCloseLatest(roomId?: string): void
  close(): Promise<void>
}

type ClientMeta = {
  roomId: string
  sessionId: string
}

function parseQuery(url: string): ClientMeta | null {
  try {
    const u = new URL(url, 'http://stub.local')
    const roomId = u.searchParams.get('roomId')?.trim()
    const sessionId = u.searchParams.get('sessionId')?.trim()
    if (!roomId || !sessionId) return null
    return { roomId, sessionId }
  } catch {
    return null
  }
}

function presencePayload(roomId: string, sessionId: string): Record<string, unknown> {
  return {
    type: 'presence',
    roomId,
    members: [
      {
        sessionId,
        displayName: 'Harness',
        isHost: false,
      },
    ],
  }
}

export async function startRoomWsStub(): Promise<RoomWsStubHandle> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise<void>((resolve) => wss.once('listening', resolve))
  const addr = wss.address()
  if (!addr || typeof addr === 'string') {
    throw new Error('room-ws-stub: could not resolve listen address')
  }
  const port = addr.port
  const clients = new Set<WebSocket>()
  let latest: WebSocket | null = null

  wss.on('connection', (ws, req) => {
    const meta = parseQuery(req.url ?? '')
    if (!meta) {
      ws.close(1008, 'missing roomId or sessionId')
      return
    }
    clients.add(ws)
    latest = ws

    ws.on('close', () => {
      clients.delete(ws)
      if (latest === ws) latest = null
    })

    ws.on('message', (raw) => {
      let data: Record<string, unknown>
      try {
        data = JSON.parse(String(raw)) as Record<string, unknown>
      } catch {
        return
      }
      const action = typeof data.action === 'string' ? data.action : ''
      if (action === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
        return
      }
      if (action === 'presence_request') {
        ws.send(JSON.stringify(presencePayload(meta.roomId, meta.sessionId)))
        return
      }
      if (action === 'chat' && typeof data.text === 'string') {
        const fanOut = {
          type: 'chat',
          roomId: meta.roomId,
          sessionId: meta.sessionId,
          messageId: `msg-${Date.now()}`,
          text: data.text,
          ts: Date.now(),
        }
        for (const peer of clients) {
          if (peer.readyState === peer.OPEN) {
            peer.send(JSON.stringify(fanOut))
          }
        }
      }
    })

    ws.send(
      JSON.stringify({
        type: 'connect_ack',
        roomId: meta.roomId,
        sessionId: meta.sessionId,
      }),
    )
  })

  return {
    port,
    url: `ws://127.0.0.1:${port}`,
    forceCloseLatest(roomId = HARNESS_ROOM_ID) {
      void roomId
      if (latest && latest.readyState === latest.OPEN) {
        latest.close(1006, 'harness-forced-drop')
      }
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        for (const peer of clients) {
          try {
            peer.close()
          } catch {
            /* ignore */
          }
        }
        wss.close((err) => (err ? reject(err) : resolve()))
      })
    },
  }
}
