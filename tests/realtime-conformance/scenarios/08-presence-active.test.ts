/**
 * Harness step 8: presence_request rehydrates lastActiveAt and active after qualifying ping.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { HARNESS_ROOM_ID } from '../lib/harness-constants.js'
import { startRoomWsStub, type RoomWsStubHandle } from '../lib/room-ws-stub.js'

type JsonMsg = Record<string, unknown>

function stubUrl(base: string, sessionId: string): string {
  return `${base}?roomId=${encodeURIComponent(HARNESS_ROOM_ID)}&sessionId=${encodeURIComponent(sessionId)}`
}

function connectClient(url: string): Promise<{ ws: WebSocket; messages: JsonMsg[] }> {
  return new Promise((resolve, reject) => {
    const messages: JsonMsg[] = []
    const ws = new WebSocket(url)
    ws.on('open', () => resolve({ ws, messages }))
    ws.on('error', reject)
    ws.on('message', (raw) => {
      try {
        messages.push(JSON.parse(String(raw)) as JsonMsg)
      } catch {
        /* ignore */
      }
    })
  })
}

function waitForPresence(messages: JsonMsg[], sessionId: string, timeoutMs = 5_000): Promise<JsonMsg> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      const hit = messages.find((m) => m.type === 'presence')
      if (hit) {
        resolve(hit)
        return
      }
      if (Date.now() >= deadline) {
        reject(new Error('timeout waiting for presence'))
        return
      }
      setTimeout(tick, 25)
    }
    tick()
  })
}

describe('harness step 8: presence_request active rehydrate', () => {
  let stub: RoomWsStubHandle | undefined

  beforeEach(async () => {
    stub = await startRoomWsStub()
  })

  afterEach(async () => {
    if (stub) await stub.close()
  })

  it('returns lastActiveAt and active after qualifying ping', async () => {
    const sessionId = 'sess-presence-active'
    const client = await connectClient(stubUrl(stub!.url, sessionId))

    client.ws.send(JSON.stringify({ action: 'ping' }))
    await new Promise((r) => setTimeout(r, 50))

    client.ws.send(JSON.stringify({ action: 'presence_request' }))
    const presence = await waitForPresence(client.messages)
    expect(presence.roomId).toBe(HARNESS_ROOM_ID)

    const members = Array.isArray(presence.members) ? presence.members : []
    const self = members.find((m) => isRecord(m) && m.sessionId === sessionId)
    expect(self).toBeTruthy()
    if (!isRecord(self)) return

    expect(self.active).toBe(true)
    expect(typeof self.lastActiveAt).toBe('number')
    expect((self.lastActiveAt as number) > 0).toBe(true)

    client.ws.close()
  })
})

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
