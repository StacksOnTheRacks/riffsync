// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOST_BRIDGE_CHANNEL } from './hostJwtBridge'
import {
  handleHostMediaControlMessage,
  type HostMediaPlayerControls,
} from './hostMediaControlBridge'

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    channel: HOST_BRIDGE_CHANNEL,
    v: 1,
    type: 'HOST_MEDIA_PLAY',
    requestId: 'req-1',
    ...overrides,
  }
}

function createDeps(controls: HostMediaPlayerControls | null = null) {
  const posted: unknown[] = []
  const pageWindow = {} as Window
  return {
    posted,
    pageWindow,
    getControls: vi.fn(() => controls),
    postMessage: vi.fn((message: unknown) => {
      posted.push(message)
    }),
  }
}

describe('hostMediaControlBridge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignores wrong channel, non-window source, and disallowed origin', () => {
    const controls = { play: vi.fn(), pause: vi.fn() }
    const deps = createDeps(controls)

    handleHostMediaControlMessage(
      { source: {}, origin: 'https://riffsync.tv', data: envelope() } as MessageEvent,
      deps,
    )
    handleHostMediaControlMessage(
      {
        source: deps.pageWindow,
        origin: 'https://evil.example',
        data: envelope(),
      } as MessageEvent,
      deps,
    )
    handleHostMediaControlMessage(
      {
        source: deps.pageWindow,
        origin: 'https://riffsync.tv',
        data: envelope({ channel: 'other' }),
      } as MessageEvent,
      deps,
    )

    expect(controls.play).not.toHaveBeenCalled()
    expect(deps.posted).toEqual([])
  })

  it('plays and pauses when controls are available', () => {
    const controls = { play: vi.fn(), pause: vi.fn() }
    const deps = createDeps(controls)

    handleHostMediaControlMessage(
      {
        source: deps.pageWindow,
        origin: 'https://riffsync.tv',
        data: envelope({ type: 'HOST_MEDIA_PLAY' }),
      } as MessageEvent,
      deps,
    )
    handleHostMediaControlMessage(
      {
        source: deps.pageWindow,
        origin: 'http://localhost:5173',
        data: envelope({ type: 'HOST_MEDIA_PAUSE', requestId: 'req-2' }),
      } as MessageEvent,
      deps,
    )

    expect(controls.play).toHaveBeenCalledOnce()
    expect(controls.pause).toHaveBeenCalledOnce()
    expect(deps.posted).toEqual([
      {
        channel: HOST_BRIDGE_CHANNEL,
        v: 1,
        type: 'HOST_MEDIA_CONTROL_RESPONSE',
        requestId: 'req-1',
        ok: true,
      },
      {
        channel: HOST_BRIDGE_CHANNEL,
        v: 1,
        type: 'HOST_MEDIA_CONTROL_RESPONSE',
        requestId: 'req-2',
        ok: true,
      },
    ])
  })

  it('returns player_unavailable when no controls are registered', () => {
    const deps = createDeps(null)
    handleHostMediaControlMessage(
      {
        source: deps.pageWindow,
        origin: 'https://riffsync.tv',
        data: envelope({ type: 'HOST_MEDIA_PAUSE' }),
      } as MessageEvent,
      deps,
    )
    expect(deps.posted[0]).toMatchObject({
      ok: false,
      error: 'player_unavailable',
      type: 'HOST_MEDIA_CONTROL_RESPONSE',
    })
  })

  it('returns command_failed when play throws', () => {
    const deps = createDeps({
      play: () => {
        throw new Error('blocked')
      },
      pause: vi.fn(),
    })
    handleHostMediaControlMessage(
      {
        source: deps.pageWindow,
        origin: 'https://riffsync.tv',
        data: envelope(),
      } as MessageEvent,
      deps,
    )
    expect(deps.posted[0]).toMatchObject({
      ok: false,
      error: 'command_failed',
    })
  })
})
