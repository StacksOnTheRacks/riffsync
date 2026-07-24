import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FanDmSession } from './FanDmSession'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3

  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    })
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }
}

describe('FanDmSession', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubEnv('VITE_PUBLIC_FAN_DM_WS_URL', 'wss://fan-dm.test.example/prod')
    vi.stubEnv('VITE_PUBLIC_API_BASE_URL', 'https://api.test.example')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('connects with accessToken and sessionId query params', async () => {
    const session = new FanDmSession({}, 'tab-1')
    session.connect('fan-jwt-token')
    await Promise.resolve()
    expect(MockWebSocket.instances).toHaveLength(1)
    const url = MockWebSocket.instances[0].url
    expect(url).toContain('wss://fan-dm.test.example/prod')
    expect(url).toContain('accessToken=fan-jwt-token')
    expect(url).toContain('sessionId=tab-1')
    expect(session.getStatus()).toBe('open')
  })

  it('parses inbound dm_message frames', async () => {
    const inbound: unknown[] = []
    const session = new FanDmSession({
      onInboundMessage: (msg) => inbound.push(msg),
    })
    session.connect('fan-jwt-token')
    await Promise.resolve()
    const ws = MockWebSocket.instances[0]
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'dm_message',
        schemaVersion: 1,
        pairKey: 'a#b',
        messageId: 'm1',
        senderSub: 'b',
        kind: 'text',
        body: 'hello',
        sentAt: 123,
      }),
    })
    expect(inbound).toHaveLength(1)
  })

  it('emits DM_PUSH_UNAVAILABLE when open socket closes', async () => {
    const errors: string[] = []
    const session = new FanDmSession({
      onDrawerError: (err) => errors.push(err.code),
    })
    session.connect('fan-jwt-token')
    await Promise.resolve()
    MockWebSocket.instances[0].close()
    expect(errors).toContain('DM_PUSH_UNAVAILABLE')
  })
})
