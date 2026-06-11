import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChatSession,
  routeInboundChatMessage,
  type ChatSessionStatus,
} from './ChatSession'
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

  it('records outbound drop when socket is not open', () => {
    const session = new ChatSession()
    session.send({ action: 'chat', text: 'hi', messageId: '550e8400-e29b-41d4-a716-446655440002' })
    expect(realtimeDiagnostics.recordOutboundDropped).toHaveBeenCalledWith(
      { action: 'chat', text: 'hi', messageId: '550e8400-e29b-41d4-a716-446655440002' },
      -1,
    )
    expect(realtimeDiagnostics.recordOutboundSent).not.toHaveBeenCalled()
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
})
