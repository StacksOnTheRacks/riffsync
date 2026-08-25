import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as googleAnalytics from '../../config/googleAnalytics'
import {
  ChatSession,
  routeInboundChatMessage,
  type ChatSessionStatus,
} from './ChatSession'
import { SfuMediaSession } from './SfuMediaSession'
import * as clientDrawerLog from '../clientDrawerLog'
import * as realtimeDiagnostics from '../realtimeDiagnostics'

vi.mock('../clientDrawerLog', () => ({
  emitClientDrawerLog: vi.fn(),
}))

vi.mock('../realtimeDiagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../realtimeDiagnostics')>()
  return {
    ...actual,
    recordInboundWsMessage: vi.fn(),
    recordOutboundSent: vi.fn(),
    recordWsClose: vi.fn(),
    recordWsConnectAttempt: vi.fn(),
    recordWsErrorEvent: vi.fn(),
    recordWsOpen: vi.fn(),
  }
})

vi.mock('../../config/googleAnalytics', () => ({
  trackGaEvent: vi.fn(),
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

  it('routes chat_history with messages and reactions for the canonical room', () => {
    const routed = routeInboundChatMessage(
      {
        type: 'chat_history',
        roomId: ROOM,
        messages: [
          {
            kind: 'text',
            sessionId: 'sess-1',
            text: 'older',
            messageId: '550e8400-e29b-41d4-a716-446655440000',
            ts: 1000,
          },
          {
            kind: 'gif',
            sessionId: 'sess-2',
            messageId: '550e8400-e29b-41d4-a716-446655440001',
            giphyId: 'gif1',
            renditionUrl: 'https://media.giphy.com/x.gif',
            ts: 2000,
          },
        ],
        reactions: {
          '550e8400-e29b-41d4-a716-446655440000': {
            '👍': { count: 2, reactedByMe: true },
          },
        },
      },
      ROOM,
    )
    expect(routed?.type).toBe('chat_history')
    if (routed?.type === 'chat_history') {
      expect(routed.event.messages).toHaveLength(2)
      expect(routed.event.reactions['550e8400-e29b-41d4-a716-446655440000']).toEqual({
        '👍': { count: 2, reactedByMe: true },
      })
    }
  })

  it('filters chat_history to canonical room id', () => {
    expect(
      routeInboundChatMessage({ type: 'chat_history', roomId: 'other', messages: [], reactions: {} }, ROOM),
    ).toBeNull()
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

  it('routes presence with active and lastActiveAt', () => {
    const routed = routeInboundChatMessage(
      {
        type: 'presence',
        roomId: ROOM,
        members: [
          {
            sessionId: 'sess-a',
            displayName: 'Alice',
            isHost: false,
            active: true,
            lastActiveAt: 1_700_000_000,
          },
        ],
      },
      ROOM,
    )
    expect(routed).toEqual({
      type: 'presence',
      event: {
        roomId: ROOM,
        members: [
          {
            sessionId: 'sess-a',
            displayName: 'Alice',
            isHost: false,
            active: true,
            lastActiveAt: 1_700_000_000,
          },
        ],
      },
    })
  })

  it('routes inbound typing start/stop', () => {
    const start = routeInboundChatMessage(
      {
        type: 'typing',
        roomId: ROOM,
        sessionId: 'sess-1',
        displayName: 'Fan',
        action: 'start',
        ts: 5000,
      },
      ROOM,
    )
    expect(start).toEqual({
      type: 'typing',
      event: {
        roomId: ROOM,
        sessionId: 'sess-1',
        displayName: 'Fan',
        action: 'start',
        ts: 5000,
      },
    })
    const stop = routeInboundChatMessage(
      {
        type: 'typing',
        roomId: ROOM,
        sessionId: 'sess-1',
        displayName: 'Fan',
        action: 'stop',
        ts: 6000,
      },
      ROOM,
    )
    expect(stop?.type).toBe('typing')
    if (stop?.type === 'typing') {
      expect(stop.event.action).toBe('stop')
    }
  })

  it('routes chat_system join/leave for canonical room', () => {
    const join = routeInboundChatMessage(
      {
        type: 'chat_system',
        roomId: ROOM,
        sessionId: 'sess-2',
        displayName: 'Bob',
        event: 'join',
        ts: 7000,
      },
      ROOM,
    )
    expect(join).toEqual({
      type: 'chat_system',
      event: {
        roomId: ROOM,
        sessionId: 'sess-2',
        displayName: 'Bob',
        event: 'join',
        ts: 7000,
      },
    })
    expect(
      routeInboundChatMessage(
        { type: 'chat_system', roomId: 'other', sessionId: 's', displayName: 'X', event: 'leave' },
        ROOM,
      ),
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
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
    vi.mocked(realtimeDiagnostics.recordOutboundSent).mockClear()
  })

  it('records outbound drop when socket is not open and returns false', () => {
    const session = new ChatSession()
    const dropped = session.send({ action: 'chat', text: 'hi', messageId: '550e8400-e29b-41d4-a716-446655440002' })
    expect(dropped).toBe(false)
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'chat',
      event: 'send_dropped',
      code: 'CHAT_SEND_DROPPED',
      outcome: 'failed',
    })
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
    expect(clientDrawerLog.emitClientDrawerLog).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})

describe('ChatSession.updateDisplayName', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pushes a rename frame on the open socket and updates stored options', () => {
    class MockWebSocket {
      static OPEN = 1
      readyState = MockWebSocket.OPEN
      send = vi.fn()
    }
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)

    const session = new ChatSession()
    ;(session as unknown as { connectOptions: Record<string, unknown> | null }).connectOptions = {
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-1',
      displayName: 'Old',
      accessToken: 'tok',
    }
    const ws = new WebSocket('wss://ws.test')
    ;(session as unknown as { ws: WebSocket | null }).ws = ws

    session.updateDisplayName('Fresh Name')

    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'rename', displayName: 'Fresh Name' }),
    )
    expect(
      (session as unknown as { connectOptions: { displayName?: string } }).connectOptions.displayName,
    ).toBe('Fresh Name')
  })

  it('updates stored options without sending when the socket is not open', () => {
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
    const session = new ChatSession()
    ;(session as unknown as { connectOptions: Record<string, unknown> | null }).connectOptions = {
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-1',
      displayName: 'Old',
      accessToken: null,
    }

    // No socket assigned: a rename must not throw and must not raise a send-dropped error.
    session.updateDisplayName('Reconnect Name')

    expect(
      (session as unknown as { connectOptions: { displayName?: string } }).connectOptions.displayName,
    ).toBe('Reconnect Name')
    expect(clientDrawerLog.emitClientDrawerLog).not.toHaveBeenCalled()
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
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
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
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith(
      expect.objectContaining({ drawer: 'chat', event: 'degraded_threshold', severity: 'warn' }),
    )
  })

  it('emits drawer logs on ws close and reconnect schedule', () => {
    const session = new ChatSession()
    session.connect({
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-close-log',
      accessToken: null,
      enabled: true,
    })

    const ws = MockWebSocket.instances.at(-1)!
    ws.emit('close', { code: 1006, reason: '' })

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'chat',
      event: 'ws_close',
      outcome: 'retry',
      severity: 'warn',
    })
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'chat',
      event: 'reconnect_scheduled',
      outcome: 'retry',
    })
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
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'chat',
      event: 'reconnect_success',
      outcome: 'recovered',
    })
  })
})

describe('ChatSession GA4 room_join', () => {
  class MockWebSocket {
    static instances: MockWebSocket[] = []
    static CONNECTING = 0
    static OPEN = 1
    readyState = MockWebSocket.CONNECTING
    private listeners = new Map<string, Array<(ev?: unknown) => void>>()

    constructor(url: string) {
      void url
      MockWebSocket.instances.push(this)
    }

    addEventListener(type: string, fn: (ev?: unknown) => void) {
      const list = this.listeners.get(type) ?? []
      list.push(fn)
      this.listeners.set(type, list)
    }

    send = vi.fn()

    emit(type: string, ev?: unknown) {
      for (const fn of this.listeners.get(type) ?? []) fn(ev)
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.mocked(googleAnalytics.trackGaEvent).mockClear()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fires room_join once for guest first connect with allowlisted params', () => {
    const session = new ChatSession()
    session.connect({
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-ga-guest',
      accessToken: 'fan-token',
      isPublisher: false,
      trackRoomJoin: true,
      gaEntrySurface: 'share_link',
      gaSource: 'share_url',
      enabled: true,
    })

    const ws = MockWebSocket.instances.at(-1)!
    ws.readyState = MockWebSocket.OPEN
    ws.emit('open')

    expect(googleAnalytics.trackGaEvent).toHaveBeenCalledTimes(1)
    expect(googleAnalytics.trackGaEvent).toHaveBeenCalledWith('room_join', {
      entry_surface: 'share_link',
      is_authenticated: true,
      source: 'share_url',
    })
    const payload = vi.mocked(googleAnalytics.trackGaEvent).mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('roomId')
    expect(Object.keys(payload)).not.toContain('sessionId')
  })

  it('skips room_join for publishers and reconnect recovery', () => {
    const session = new ChatSession()
    session.connect({
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-ga-host',
      accessToken: 'host-token',
      isPublisher: true,
      trackRoomJoin: true,
      gaEntrySurface: 'lobby',
      enabled: true,
    })
    MockWebSocket.instances.at(-1)!.emit('open')
    expect(googleAnalytics.trackGaEvent).not.toHaveBeenCalled()

    const guest = new ChatSession()
    guest.connect({
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-ga-reconnect',
      accessToken: null,
      trackRoomJoin: true,
      gaEntrySurface: 'lobby',
      gaSource: 'lobby_card',
      enabled: true,
    })
    const first = MockWebSocket.instances.at(-1)!
    first.readyState = MockWebSocket.OPEN
    first.emit('open')
    expect(googleAnalytics.trackGaEvent).toHaveBeenCalledTimes(1)

    first.emit('close', { code: 1006, reason: '' })
    vi.runOnlyPendingTimers()
    const second = MockWebSocket.instances.at(-1)!
    second.readyState = MockWebSocket.OPEN
    second.emit('open')
    expect(googleAnalytics.trackGaEvent).toHaveBeenCalledTimes(1)
  })
})

describe('ChatSession compose typing', () => {
  class MockWebSocket {
    static OPEN = 1
    readyState = MockWebSocket.OPEN
    send = vi.fn()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('debounces typing_start by 300ms and emits typing_stop on send', () => {
    const session = new ChatSession()
    ;(session as unknown as { connectOptions: Record<string, unknown> | null }).connectOptions = {
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-1',
      accessToken: 'tok',
    }
    const ws = new WebSocket('wss://ws.test')
    ;(session as unknown as { ws: WebSocket | null }).ws = ws

    session.onComposeDraftChange('hello')
    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'typing_start' }),
    )

    session.onComposeSent()
    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'typing_stop' }),
    )
  })

  it('does not emit typing_start without fan JWT', () => {
    const session = new ChatSession()
    ;(session as unknown as { connectOptions: Record<string, unknown> | null }).connectOptions = {
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-guest',
      accessToken: null,
    }
    const ws = new WebSocket('wss://ws.test')
    ;(session as unknown as { ws: WebSocket | null }).ws = ws

    session.onComposeDraftChange('hello')
    vi.advanceTimersByTime(300)
    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).not.toHaveBeenCalled()
  })

  it('emits typing_stop after 3s compose idle', () => {
    const session = new ChatSession()
    ;(session as unknown as { connectOptions: Record<string, unknown> | null }).connectOptions = {
      url: 'wss://ws.test',
      roomId: ROOM,
      sessionId: 'sess-1',
      accessToken: 'tok',
    }
    const ws = new WebSocket('wss://ws.test')
    ;(session as unknown as { ws: WebSocket | null }).ws = ws

    session.onComposeDraftChange('typing')
    vi.advanceTimersByTime(300)
    vi.mocked((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).mockClear()

    vi.advanceTimersByTime(3000)
    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      JSON.stringify({ action: 'typing_stop' }),
    )
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
