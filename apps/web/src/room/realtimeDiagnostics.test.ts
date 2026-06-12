import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientDrawerLog from './clientDrawerLog'
import {
  clearRealtimeDiag,
  getRealtimeDiagSnapshot,
  recordOutboundDropped,
} from './realtimeDiagnostics'

vi.mock('./clientDrawerLog', () => ({
  emitClientDrawerLog: vi.fn(),
}))

describe('recordOutboundDropped', () => {
  beforeEach(() => {
    clearRealtimeDiag()
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('increments diag counters and timeline without riffsync-diag warn string', () => {
    recordOutboundDropped({ action: 'chat', text: 'hi' }, 3)

    const snapshot = getRealtimeDiagSnapshot()
    expect(snapshot.outboundDropped).toEqual({
      ping: 0,
      chat: 1,
      signaling: 0,
      other: 0,
    })
    const timeline = snapshot.wsTimelineRecent as Array<{ ev: string; action?: string; readyState?: number }>
    expect(timeline.at(-1)).toMatchObject({
      ev: 'outbound_skipped',
      action: 'chat',
      readyState: 3,
    })
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('emits drawer-tagged send_dropped log', () => {
    recordOutboundDropped({ action: 'ping' }, -1)

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'chat',
      event: 'send_dropped',
      code: 'CHAT_SEND_DROPPED',
      outcome: 'failed',
    })
  })
})
