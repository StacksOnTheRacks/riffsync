import { WebSocketServer, type WebSocket } from 'ws'
import { HARNESS_ROOM_ID } from './harness-constants.js'

/** Active idle window — matches `infra/cdk/lambda/ws-shared.ts`. */
const PRESENCE_ACTIVE_WINDOW_SEC = 120

export type RoomWsStubHandle = {
  url: string
  port: number
  forceCloseLatest(roomId?: string): void
  close(): Promise<void>
}

type ClientMeta = {
  roomId: string
  sessionId: string
  displayName: string
  ws: WebSocket
}

type SessionRoster = {
  sessionId: string
  displayName: string
  lastActiveAt?: number
  typing: boolean
}

function parseQuery(url: string): Omit<ClientMeta, 'displayName' | 'ws'> | null {
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

function derivePresenceActive(lastActiveAt: number | undefined, nowSec: number): boolean {
  if (lastActiveAt === undefined) return false
  return nowSec - lastActiveAt < PRESENCE_ACTIVE_WINDOW_SEC
}

function guestLabel(sessionId: string): string {
  return sessionId.length > 8 ? `Guest (${sessionId.slice(0, 8)}…)` : 'Guest'
}

export async function startRoomWsStub(): Promise<RoomWsStubHandle> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise<void>((resolve) => wss.once('listening', resolve))
  const addr = wss.address()
  if (!addr || typeof addr === 'string') {
    throw new Error('room-ws-stub: could not resolve listen address')
  }
  const port = addr.port
  const clients = new Map<WebSocket, ClientMeta>()
  const rosterByRoom = new Map<string, Map<string, SessionRoster>>()
  let latest: WebSocket | null = null

  const rosterForRoom = (roomId: string): Map<string, SessionRoster> => {
    let map = rosterByRoom.get(roomId)
    if (!map) {
      map = new Map()
      rosterByRoom.set(roomId, map)
    }
    return map
  }

  const ensureSession = (roomId: string, sessionId: string, displayName?: string): SessionRoster => {
    const room = rosterForRoom(roomId)
    let row = room.get(sessionId)
    if (!row) {
      row = {
        sessionId,
        displayName: displayName ?? guestLabel(sessionId),
        typing: false,
      }
      room.set(sessionId, row)
    }
    return row
  }

  const presencePayload = (roomId: string): Record<string, unknown> => {
    const nowSec = Math.floor(Date.now() / 1000)
    const room = rosterForRoom(roomId)
    const members = [...room.values()].map((row) => {
      const active = derivePresenceActive(row.lastActiveAt, nowSec)
      const member: Record<string, unknown> = {
        sessionId: row.sessionId,
        displayName: row.displayName,
        isHost: false,
        active,
      }
      if (row.lastActiveAt !== undefined) {
        member.lastActiveAt = row.lastActiveAt
      }
      return member
    })
    return { type: 'presence', roomId, members }
  }

  const fanOut = (roomId: string, payload: Record<string, unknown>, except?: WebSocket): void => {
    const raw = JSON.stringify(payload)
    for (const [peer, meta] of clients) {
      if (meta.roomId !== roomId) continue
      if (except && peer === except) continue
      if (peer.readyState === peer.OPEN) {
        peer.send(raw)
      }
    }
  }

  const fanOutTyping = (
    roomId: string,
    sessionId: string,
    displayName: string,
    action: 'start' | 'stop',
    except?: WebSocket,
  ): void => {
    fanOut(
      roomId,
      {
        type: 'typing',
        roomId,
        sessionId,
        displayName,
        action,
        ts: Date.now(),
      },
      except,
    )
  }

  wss.on('connection', (ws, req) => {
    const parsed = parseQuery(req.url ?? '')
    if (!parsed) {
      ws.close(1008, 'missing roomId or sessionId')
      return
    }
    const displayName = guestLabel(parsed.sessionId)
    const meta: ClientMeta = { ...parsed, displayName, ws }
    clients.set(ws, meta)
    latest = ws
    ensureSession(parsed.roomId, parsed.sessionId, displayName)

    ws.on('close', () => {
      clients.delete(ws)
      if (latest === ws) latest = null
      const row = rosterForRoom(parsed.roomId).get(parsed.sessionId)
      if (row?.typing) {
        row.typing = false
        fanOutTyping(parsed.roomId, parsed.sessionId, displayName, 'stop')
      }
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
        const nowSec = Math.floor(Date.now() / 1000)
        const row = ensureSession(meta.roomId, meta.sessionId, meta.displayName)
        row.lastActiveAt = Math.max(row.lastActiveAt ?? 0, nowSec)
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
        return
      }
      if (action === 'presence_request') {
        ws.send(JSON.stringify(presencePayload(meta.roomId)))
        return
      }
      if (action === 'typing_start' || action === 'typing_stop') {
        const typingAction = action === 'typing_start' ? 'start' : 'stop'
        const row = ensureSession(meta.roomId, meta.sessionId, meta.displayName)
        if (typingAction === 'start') {
          row.typing = true
        } else {
          row.typing = false
        }
        fanOutTyping(meta.roomId, meta.sessionId, meta.displayName, typingAction)
        return
      }
      if (action === 'chat' && typeof data.text === 'string') {
        const chatPayload = {
          type: 'chat',
          roomId: meta.roomId,
          sessionId: meta.sessionId,
          messageId: `msg-${Date.now()}`,
          text: data.text,
          ts: Date.now(),
        }
        fanOut(meta.roomId, chatPayload)
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
        for (const [peer] of clients) {
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
