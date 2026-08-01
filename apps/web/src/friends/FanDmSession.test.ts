import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FanDmSession, syncSharedFanDmSessionWithAuth } from './FanDmSession'

const getFanAccessToken = vi.fn<() => string | null>()

vi.mock('../auth/fanTokens', () => ({
  FAN_AUTH_CHANGED_EVENT: 'riffsync:fan-auth-changed',
  getFanAccessToken: () => getFanAccessToken(),
}))

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
    getFanAccessToken.mockReset()
    getFanAccessToken.mockReturnValue('fan-jwt-token')
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubEnv('VITE_PUBLIC_FAN_DM_WS_URL', 'wss://fan-dm.test.example/prod')
    vi.stubEnv('VITE_PUBLIC_API_BASE_URL', 'https://api.test.example')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('connects with accessToken and sessionId query params', async () => {
    const session = new FanDmSession({}, 'tab-1')
    session.connect()
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
    session.connect()
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
    session.connect()
    await Promise.resolve()
    MockWebSocket.instances[0].close()
    expect(errors).toContain('DM_PUSH_UNAVAILABLE')
  })

  it('reconnects after an open socket closes while fan auth remains available', async () => {
    vi.useFakeTimers()
    const session = new FanDmSession({}, 'tab-reconnect')
    session.connect()
    await Promise.resolve()

    MockWebSocket.instances[0].close()
    expect(session.getStatus()).toBe('closed')

    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.resolve()

    expect(MockWebSocket.instances).toHaveLength(2)
    expect(MockWebSocket.instances[1].url).toContain('sessionId=tab-reconnect')
  })

  it('does not open WebSocket when fan access token is absent', async () => {
    getFanAccessToken.mockReturnValue(null)
    const session = new FanDmSession()
    session.connect()
    await Promise.resolve()
    expect(MockWebSocket.instances).toHaveLength(0)
    expect(session.getStatus()).toBe('idle')
  })

  it('syncSharedFanDmSessionWithAuth disconnects without fan token', async () => {
    getFanAccessToken.mockReturnValue('fan-jwt-token')
    syncSharedFanDmSessionWithAuth()
    await Promise.resolve()
    expect(MockWebSocket.instances).toHaveLength(1)

    getFanAccessToken.mockReturnValue(null)
    syncSharedFanDmSessionWithAuth()
    await Promise.resolve()
    expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.CLOSED)
  })
})
