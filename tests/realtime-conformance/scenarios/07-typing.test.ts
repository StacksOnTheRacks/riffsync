/**
 * Harness step 7: typing fan-out and clear on stop/disconnect.
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

function waitForTyping(
  messages: JsonMsg[],
  action: 'start' | 'stop',
  sessionId: string,
  timeoutMs = 5_000,
): Promise<JsonMsg> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      const hit = messages.find(
        (m) =>
          m.type === 'typing' &&
          m.sessionId === sessionId &&
          m.action === action,
      )
      if (hit) {
        resolve(hit)
        return
      }
      if (Date.now() >= deadline) {
        reject(new Error(`timeout waiting for typing ${action} from ${sessionId}`))
        return
      }
      setTimeout(tick, 25)
    }
    tick()
  })
}

describe('harness step 7: typing fan-out', () => {
  let stub: RoomWsStubHandle | undefined

  beforeEach(async () => {
    stub = await startRoomWsStub()
  })

  afterEach(async () => {
    if (stub) await stub.close()
  })

  it('fans out typing_start and clears on typing_stop', async () => {
    const typer = await connectClient(stubUrl(stub!.url, 'sess-typer'))
    const observer = await connectClient(stubUrl(stub!.url, 'sess-observer'))

    typer.ws.send(JSON.stringify({ action: 'typing_start' }))
    const startMsg = await waitForTyping(observer.messages, 'start', 'sess-typer')
    expect(startMsg.displayName).toBeTruthy()
    expect(startMsg.roomId).toBe(HARNESS_ROOM_ID)

    typer.ws.send(JSON.stringify({ action: 'typing_stop' }))
    await waitForTyping(observer.messages, 'stop', 'sess-typer')

    typer.ws.close()
    observer.ws.close()
  })

  it('clears typing on disconnect', async () => {
    const typer = await connectClient(stubUrl(stub!.url, 'sess-typer-drop'))
    const observer = await connectClient(stubUrl(stub!.url, 'sess-observer-drop'))

    typer.ws.send(JSON.stringify({ action: 'typing_start' }))
    await waitForTyping(observer.messages, 'start', 'sess-typer-drop')

    typer.ws.close()
    await waitForTyping(observer.messages, 'stop', 'sess-typer-drop')

    observer.ws.close()
  })
})
