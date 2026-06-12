import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChatSession,
  routeInboundChatMessage,
  type ChatSessionStatus,
} from './ChatSession'
import { SfuMediaSession } from './SfuMediaSession'
import * as realtimeDiagnostics from '../realtimeDiagnostics'

vi.mock('../realtimeDiagnostics', () => ({
  recordInboundWsMessage: vi.fn(),
  recordOutboundDropped: vi.fn(),
  recordOutboundSent: vi.fn(),
  recordWsClose: vi.fn(),
  recordWsConnectAttempt: vi.fn(),
  recordWsErrorEvent: vi.fn(),
  recordWsOpen: vi.fn(),
}))

const ROOM = 'room-abc'

describe('routeInboundChatMessage', () => {
  it('routes chat text with messageId and optional display metadata', () => {
    const routed = routeInboundChatMessage(
      {
        type: 'chat',
        sessionId: 'sess-1',
        text: 'hello',
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        ts: 1000,
        displayName: 'Fan',
        avatarUrl: ' https://cdn.example/a.png ',
      },
      ROOM,
    )
    expect(routed).toEqual({
      type: 'chat_text',
      line: {
        kind: 'text',
        sessionId: 'sess-1',
        text: 'hello',
        messageId: '550e8400-e29b-41d4-a716-446655440000',
        ts: 1000,
        displayName: 'Fan',
        avatarUrl: 'https://cdn.example/a.png',
      },
    })
  })

  it('ignores chat text without a valid messageId', () => {
    expect(
      routeInboundChatMessage({ type: 'chat', sessionId: 's', text: 'x', messageId: '' }, ROOM),
    ).toBeNull()
  })

  it('routes chat_gif via shared parser', () => {
    const routed = routeInboundChatMessage(
      {
        type: 'chat_gif',
        sessionId: 'sess-2',
        messageId: '550e8400-e29b-41d4-a716-446655440001',
        giphyId: 'gif1',
        renditionUrl: 'https://media.giphy.com/x.gif',
        ts: 2000,
      },
      ROOM,
    )
    expect(routed?.type).toBe('chat_gif')
    if (routed?.type === 'chat_gif') {
      expect(routed.line.kind).toBe('gif')
      expect(routed.line.giphyId).toBe('gif1')
    }
  })

  it('routes chat_reaction add/remove', () => {
    const routed = routeInboundChatMessage(
      {
        type: 'chat_reaction',
        messageId: 'm1',
        emoji: '👍',
        action: 'add',
        sessionId: 'sess-3',
      },
      ROOM,
    )
    expect(routed).toEqual({
      type: 'chat_reaction',
      event: { messageId: 'm1', emoji: '👍', action: 'add', sessionId: 'sess-3' },
    })
  })

  it('filters presence to canonical room id', () => {
    const ok = routeInboundChatMessage(
      {
        type: 'presence',
        roomId: ROOM,
        members: [{ sessionId: 'a', displayName: 'A', isHost: true }],
      },
      ROOM,
    )
    expect(ok?.type).toBe('presence')
    expect(
      routeInboundChatMessage({ type: 'presence', roomId: 'other', members: [] }, ROOM),
    ).toBeNull()
  })

  it('routes share_state started per #146 api_contracts matrix', () => {
    expect(
      routeInboundChatMessage({ type: 'share_state', roomId: ROOM, state: 'started' }, ROOM),
    ).toEqual({ type: 'share_state', event: { roomId: ROOM, state: 'started' } })
  })

  it('routes media policy frames without SFU side effects', () => {
    expect(
      routeInboundChatMessage({ type: 'share_state', roomId: ROOM, state: 'stopped' }, ROOM),
    ).toEqual({ type: 'share_state', event: { roomId: ROOM, state: 'stopped' } })
    expect(routeInboundChatMessage({ type: 'room_mode', roomMode: 'videoChat' }, ROOM)).toEqual({
      type: 'room_mode',
      event: { roomMode: 'videoChat' },
    })
    expect(routeInboundChatMessage({ type: 'av_disabled', avDisabled: true }, ROOM)).toEqual({
      type: 'av_disabled',
      event: { avDisabled: true },
    })
  })
})

describe('ChatSession send', () => {
  beforeEach(() => {
    vi.mocked(realtimeDiagnostics.recordOutboundDropped).mockClear()
    vi.mocked(realtimeDiagnostics.recordOutboundSent).mockClear()
  })

  it('records outbound drop when socket is not open and returns false', () => {
    const session = new ChatSession()
    const dropped = session.send({ action: 'chat', text: 'hi', messageId: '550e8400-e29b-41d4-a716-446655440002' })
    expect(dropped).toBe(false)
    expect(realtimeDiagnostics.recordOutboundDropped).toHaveBeenCalledWith(
      { action: 'chat', text: 'hi', messageId: '550e8400-e29b-41d4-a716-446655440002' },
      -1,
    )
    expect(realtimeDiagnostics.recordOutboundSent).not.toHaveBeenCalled()
    expect(session.getLastErrorCode()).toBe('CHAT_SEND_DROPPED')
  })

  it('notifies send-dropped listeners with typed drawer errors without queueing', () => {
    const session = new ChatSession()
    const dropped = vi.fn()
    session.onSendDropped(dropped)
    session.send({ action: 'ping' })
    expect(dropped).toHaveBeenCalledTimes(1)
    expect(dropped).toHaveBeenCalledWith({
      code: 'CHAT_SEND_DROPPED',
      drawer: 'chat',
      cause: { readyState: -1 },
    })
  })

  it('returns true and records outbound sent when socket is open', () => {
    class MockWebSocket {
      static OPEN = 1
      readyState = MockWebSocket.OPEN
      send = vi.fn()
    }
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)

    const session = new ChatSession()
    ;(session as unknown as { ws: WebSocket | null }).ws = new WebSocket('wss://ws.test')

    const payload = { action: 'chat', text: 'hi', messageId: '550e8400-e29b-41d4-a716-446655440004' }
    expect(session.send(payload)).toBe(true)
    expect(realtimeDiagnostics.recordOutboundSent).toHaveBeenCalledWith(payload)
    expect(realtimeDiagnostics.recordOutboundDropped).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})

describe('ChatSession lifecycle FSM', () => {
  class MockWebSocket {
    static OPEN = 1
    static instances: MockWebSocket[] = []
    readyState = 0
    listeners = new Map<string, Array<(ev?: unknown) => void>>()

    constructor(url: string) {
      void url
      MockWebSocket.instances.push(this)
    }

    send = vi.fn()

    addEventListener(type: string, fn: (ev?: unknown) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(fn)
      this.listeners.set(type, list)
    }

    close() {
      this.readyState = 3
    }

    emit(type: string, ev?: unknown) {
      for (const fn of this.listeners.get(type) ?? []) fn(ev)
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    Object.assign(MockWebSocket, { OPEN: 1, CONNECTING: 0, CLOSING: 2, CLOSED: 3 })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('promotes to degraded after three failed reconnect cycles', () => {
    const session = new ChatSession()
    session.connect({
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-fsm',
      accessToken: null,
      enabled: true,
    })

    expect(session.getLifecycleState()).toBe('reconnecting')

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const ws = MockWebSocket.instances.at(-1)!
      ws.emit('close', { code: 1006, reason: '' })
      vi.runOnlyPendingTimers()
    }

    expect(session.getLifecycleState()).toBe('degraded')
  })

  it('resets failed cycles and returns to connected after a successful open', () => {
    const session = new ChatSession()
    session.connect({
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-recover',
      accessToken: null,
      enabled: true,
    })

    const first = MockWebSocket.instances.at(-1)!
    first.emit('close', { code: 1006, reason: '' })
    vi.runOnlyPendingTimers()

    const second = MockWebSocket.instances.at(-1)!
    second.readyState = MockWebSocket.OPEN
    second.emit('open')

    expect(session.getLifecycleState()).toBe('connected')
    expect(session.getStatus()).toBe('open')
  })
})

describe('ChatSession subscriptions', () => {
  it('notifies chat and media-policy listeners from routed inbound frames', () => {
    const session = new ChatSession()
    const chatLines: string[] = []
    const shareStates: unknown[] = []
    const statuses: ChatSessionStatus[] = []

    session.onChatText((line) => chatLines.push(line.text))
    session.onShareState((ev) => shareStates.push(ev.state))
    session.onStatusChange((s) => statuses.push(s))

    const dispatch = (
      session as unknown as { dispatchInbound: (d: Record<string, unknown>) => void }
    ).dispatchInbound.bind(session)
    ;(session as unknown as { connectOptions: { roomId: string } }).connectOptions = {
      roomId: ROOM,
    }

    dispatch({
      type: 'chat',
      sessionId: 's',
      text: 'ping',
      messageId: '550e8400-e29b-41d4-a716-446655440003',
    })
    dispatch({ type: 'share_state', roomId: ROOM, state: 'stopped' })

    expect(chatLines).toEqual(['ping'])
    expect(shareStates).toEqual(['stopped'])
    expect(statuses).toEqual([])
  })

  it('share_state started does not invoke handleShareStateStopped or detachConsumerClass (#146 Guest theater started)', () => {
    const session = new ChatSession()
    const sfu = new SfuMediaSession()
    const handleShareStateStopped = vi.spyOn(sfu, 'handleShareStateStopped')
    const detach = vi.fn()
    ;(
      sfu as unknown as {
        sessionHandle: { detachConsumerClass: ReturnType<typeof vi.fn> }
      }
    ).sessionHandle = { detachConsumerClass: detach }

    session.onShareState((event) => {
      if (event.state !== 'stopped') return
      sfu.handleShareStateStopped(false)
    })
    ;(session as unknown as { setStatus: (status: ChatSessionStatus) => void }).setStatus('open')
    ;(session as unknown as { setLifecycleState: (state: string) => void }).setLifecycleState(
      'connected',
    )

    const dispatch = (
      session as unknown as { dispatchInbound: (d: Record<string, unknown>) => void }
    ).dispatchInbound.bind(session)
    ;(session as unknown as { connectOptions: { roomId: string } }).connectOptions = {
      roomId: ROOM,
    }

    dispatch({ type: 'share_state', roomId: ROOM, state: 'started' })

    expect(handleShareStateStopped).not.toHaveBeenCalled()
    expect(detach).not.toHaveBeenCalled()
    expect(session.getStatus()).toBe('open')
    expect(session.getLifecycleState()).toBe('connected')
  })

  it('keeps status open when share-stop media policy runs', () => {
    const session = new ChatSession()
    const sfu = new SfuMediaSession()
    session.onShareState((event) => {
      if (event.state !== 'stopped') return
      sfu.handleShareStateStopped(false)
    })
    ;(session as unknown as { setStatus: (status: ChatSessionStatus) => void }).setStatus('open')
    ;(session as unknown as { setLifecycleState: (state: string) => void }).setLifecycleState(
      'connected',
    )

    const dispatch = (
      session as unknown as { dispatchInbound: (d: Record<string, unknown>) => void }
    ).dispatchInbound.bind(session)
    ;(session as unknown as { connectOptions: { roomId: string } }).connectOptions = {
      roomId: ROOM,
    }

    dispatch({ type: 'share_state', roomId: ROOM, state: 'stopped' })

    expect(session.getStatus()).toBe('open')
    expect(session.getLifecycleState()).toBe('connected')
  })
})
