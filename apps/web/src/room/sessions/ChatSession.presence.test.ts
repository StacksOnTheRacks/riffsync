import { describe, expect, it } from 'vitest'
import { routeInboundChatMessage } from './ChatSession'

describe('routeInboundChatMessage presence fanSub (#377)', () => {
  it('parses optional fanSub on presence members', () => {
    const routed = routeInboundChatMessage(
      {
        type: 'presence',
        roomId: 'room-1',
        members: [
          {
            sessionId: 'sess-fan',
            displayName: 'Fan',
            isHost: false,
            fanSub: 'fan-sub-b',
          },
          {
            sessionId: 'sess-guest',
            displayName: 'Guest',
            isHost: false,
          },
        ],
      },
      'room-1',
    )

    expect(routed?.type).toBe('presence')
    if (routed?.type !== 'presence') return
    expect(routed.event.members[0]?.fanSub).toBe('fan-sub-b')
    expect(routed.event.members[1]?.fanSub).toBeUndefined()
  })
})
