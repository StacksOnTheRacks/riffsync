// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildReceiverRenderedAcknowledgement } from './castChannelProtocol'
import type { CastPresentationSnapshot } from './castChannelProtocol'
import { useCastStartSession } from './useCastStartSession'

function TestHarness({ enabled = true }: { enabled?: boolean }) {
  const stopCastSpy = vi.fn()
  const sessionEndSpy = vi.fn().mockResolvedValue(undefined)
  const messageListeners = new Set<(message: unknown) => void>()
  const sessionEndedListeners = new Set<() => void>()
  const activeRoute = true

  const { castStartLifecycle, startCast, stopCast } = useCastStartSession({
    enabled,
    expandedViewActive: false,
    roomMode: 'theater',
    youtubeVideoId: 'yt-1',
    isPublisher: false,
    hasHostCaptureStream: false,
    hasGuestRelayStream: false,
    chat: [],
    chatMemberLabels: new Map(),
    createSenderClient: () => ({
      requestSession: vi.fn().mockResolvedValue({
        sendMessage: async (message: unknown) => {
          queueMicrotask(() => {
            if (typeof message === 'object' && message !== null) {
              const outbound = message as { type?: string; snapshot?: CastPresentationSnapshot }
              if (outbound.type === 'presentation_snapshot' && outbound.snapshot?.snapshotId) {
                const ack = buildReceiverRenderedAcknowledgement(outbound.snapshot.snapshotId)
                for (const listener of messageListeners) listener(ack)
              }
            }
          })
        },
        addMessageListener: (handler: (message: unknown) => void) => {
          messageListeners.add(handler)
          return () => messageListeners.delete(handler)
        },
        addSessionEndedListener: (handler: () => void) => {
          sessionEndedListeners.add(handler)
          return () => sessionEndedListeners.delete(handler)
        },
        hasActiveRoute: () => activeRoute,
        end: sessionEndSpy,
      }),
    }),
  })

  stopCastSpy.mockImplementation(() => {
    stopCast()
  })

  return (
    <div>
      <span data-testid="lifecycle">{castStartLifecycle}</span>
      <button type="button" data-testid="start" onClick={() => void startCast()}>
        Start
      </button>
      <button type="button" data-testid="stop" onClick={() => stopCastSpy()}>
        Stop
      </button>
    </div>
  )
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('useCastStartSession room authority (#305)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderHarness(enabled = true) {
    act(() => {
      root.render(<TestHarness enabled={enabled} />)
    })
  }

  it('route leave cleanup stops Cast without touching room integration surfaces', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const WebSocketSpy = vi.fn()
    vi.stubGlobal('WebSocket', WebSocketSpy)

    await renderHarness()

    await act(async () => {
      ;(container.querySelector('[data-testid="start"]') as HTMLButtonElement).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('casting')

    act(() => {
      root.unmount()
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(WebSocketSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('stop intent returns lifecycle to idle without room fetch or websocket usage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const WebSocketSpy = vi.fn()
    vi.stubGlobal('WebSocket', WebSocketSpy)

    await renderHarness()

    await act(async () => {
      ;(container.querySelector('[data-testid="start"]') as HTMLButtonElement).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      ;(container.querySelector('[data-testid="stop"]') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('idle')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(WebSocketSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('start failure stays sender-local without room fetch or websocket usage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const WebSocketSpy = vi.fn()
    vi.stubGlobal('WebSocket', WebSocketSpy)

    function FailureHarness() {
      const { castStartLifecycle, startCast } = useCastStartSession({
        enabled: true,
        expandedViewActive: false,
        roomMode: 'theater',
        youtubeVideoId: 'yt-1',
        isPublisher: false,
        hasHostCaptureStream: false,
        hasGuestRelayStream: false,
        chat: [],
        chatMemberLabels: new Map(),
        createSenderClient: () => ({
          requestSession: vi.fn().mockRejectedValue(new Error('Cast unavailable')),
        }),
      })

      return (
        <div>
          <span data-testid="lifecycle">{castStartLifecycle}</span>
          <button type="button" data-testid="start" onClick={() => void startCast()}>
            Start
          </button>
        </div>
      )
    }

    act(() => {
      root.render(<FailureHarness />)
    })

    await act(async () => {
      ;(container.querySelector('[data-testid="start"]') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('start_failed')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(WebSocketSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('session_ended recovery stays sender-local without room fetch or websocket usage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const WebSocketSpy = vi.fn()
    vi.stubGlobal('WebSocket', WebSocketSpy)
    const messageListeners = new Set<(message: unknown) => void>()
    const sessionEndedListeners = new Set<() => void>()

    function SessionEndedHarness() {
      const { castStartLifecycle, startCast } = useCastStartSession({
        enabled: true,
        expandedViewActive: false,
        roomMode: 'theater',
        youtubeVideoId: 'yt-1',
        isPublisher: false,
        hasHostCaptureStream: false,
        hasGuestRelayStream: false,
        chat: [],
        chatMemberLabels: new Map(),
        createSenderClient: () => ({
          requestSession: vi.fn().mockResolvedValue({
            sendMessage: async (message: unknown) => {
              queueMicrotask(() => {
                if (typeof message === 'object' && message !== null) {
                  const outbound = message as { type?: string; snapshot?: CastPresentationSnapshot }
                  if (outbound.type === 'presentation_snapshot' && outbound.snapshot?.snapshotId) {
                    const ack = buildReceiverRenderedAcknowledgement(outbound.snapshot.snapshotId)
                    for (const listener of messageListeners) listener(ack)
                  }
                }
              })
            },
            addMessageListener: (handler: (message: unknown) => void) => {
              messageListeners.add(handler)
              return () => messageListeners.delete(handler)
            },
            addSessionEndedListener: (handler: () => void) => {
              sessionEndedListeners.add(handler)
              return () => sessionEndedListeners.delete(handler)
            },
            hasActiveRoute: () => true,
            end: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      })

      return (
        <div>
          <span data-testid="lifecycle">{castStartLifecycle}</span>
          <button type="button" data-testid="start" onClick={() => void startCast()}>
            Start
          </button>
        </div>
      )
    }

    act(() => {
      root.render(<SessionEndedHarness />)
    })

    await act(async () => {
      ;(container.querySelector('[data-testid="start"]') as HTMLButtonElement).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      for (const listener of sessionEndedListeners) listener()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('session_ended')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(WebSocketSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('playback_blocked recovery stays sender-local without room fetch or websocket usage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const WebSocketSpy = vi.fn()
    vi.stubGlobal('WebSocket', WebSocketSpy)
    const messageListeners = new Set<(message: unknown) => void>()

    function PlaybackBlockedHarness() {
      const { castStartLifecycle, startCast } = useCastStartSession({
        enabled: true,
        expandedViewActive: false,
        roomMode: 'theater',
        youtubeVideoId: 'yt-1',
        isPublisher: false,
        hasHostCaptureStream: false,
        hasGuestRelayStream: false,
        chat: [],
        chatMemberLabels: new Map(),
        createSenderClient: () => ({
          requestSession: vi.fn().mockResolvedValue({
            sendMessage: async (message: unknown) => {
              queueMicrotask(() => {
                if (typeof message === 'object' && message !== null) {
                  const outbound = message as { type?: string; snapshot?: CastPresentationSnapshot }
                  if (outbound.type === 'presentation_snapshot' && outbound.snapshot?.snapshotId) {
                    const ack = buildReceiverRenderedAcknowledgement(outbound.snapshot.snapshotId)
                    for (const listener of messageListeners) listener(ack)
                    for (const listener of messageListeners) listener({ type: 'render_failed' })
                  }
                }
              })
            },
            addMessageListener: (handler: (message: unknown) => void) => {
              messageListeners.add(handler)
              return () => messageListeners.delete(handler)
            },
            addSessionEndedListener: () => () => undefined,
            hasActiveRoute: () => true,
            end: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      })

      return (
        <div>
          <span data-testid="lifecycle">{castStartLifecycle}</span>
          <button type="button" data-testid="start" onClick={() => void startCast()}>
            Start
          </button>
        </div>
      )
    }

    act(() => {
      root.render(<PlaybackBlockedHarness />)
    })

    await act(async () => {
      ;(container.querySelector('[data-testid="start"]') as HTMLButtonElement).click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('playback_blocked')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(WebSocketSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('stop_failed recovery stays sender-local without room fetch or websocket usage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const WebSocketSpy = vi.fn()
    vi.stubGlobal('WebSocket', WebSocketSpy)
    const messageListeners = new Set<(message: unknown) => void>()

    function StopFailedHarness() {
      const { castStartLifecycle, startCast, stopCast } = useCastStartSession({
        enabled: true,
        expandedViewActive: false,
        roomMode: 'theater',
        youtubeVideoId: 'yt-1',
        isPublisher: false,
        hasHostCaptureStream: false,
        hasGuestRelayStream: false,
        chat: [],
        chatMemberLabels: new Map(),
        createSenderClient: () => ({
          requestSession: vi.fn().mockResolvedValue({
            sendMessage: async (message: unknown) => {
              queueMicrotask(() => {
                if (typeof message === 'object' && message !== null) {
                  const outbound = message as { type?: string; snapshot?: CastPresentationSnapshot }
                  if (outbound.type === 'presentation_snapshot' && outbound.snapshot?.snapshotId) {
                    const ack = buildReceiverRenderedAcknowledgement(outbound.snapshot.snapshotId)
                    for (const listener of messageListeners) listener(ack)
                  }
                }
              })
            },
            addMessageListener: (handler: (message: unknown) => void) => {
              messageListeners.add(handler)
              return () => messageListeners.delete(handler)
            },
            addSessionEndedListener: () => () => undefined,
            hasActiveRoute: () => true,
            end: vi.fn().mockRejectedValue(new Error('stop rejected')),
          }),
        }),
      })

      return (
        <div>
          <span data-testid="lifecycle">{castStartLifecycle}</span>
          <button type="button" data-testid="start" onClick={() => void startCast()}>
            Start
          </button>
          <button type="button" data-testid="stop" onClick={() => stopCast()}>
            Stop
          </button>
        </div>
      )
    }

    act(() => {
      root.render(<StopFailedHarness />)
    })

    await act(async () => {
      ;(container.querySelector('[data-testid="start"]') as HTMLButtonElement).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      ;(container.querySelector('[data-testid="stop"]') as HTMLButtonElement).click()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('stop_failed')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(WebSocketSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('repeated unmount cleanup is idempotent without room fetch or websocket usage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    const WebSocketSpy = vi.fn()
    vi.stubGlobal('WebSocket', WebSocketSpy)

    await renderHarness()

    await act(async () => {
      ;(container.querySelector('[data-testid="start"]') as HTMLButtonElement).click()
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      root.unmount()
    })
    act(() => {
      root.unmount()
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(WebSocketSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
