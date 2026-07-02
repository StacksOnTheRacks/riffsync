// @vitest-environment happy-dom
import { act, useRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCastStartSession } from './useCastStartSession'

type HarnessSession = {
  end: ReturnType<typeof vi.fn>
  sendMessage: () => Promise<void>
  addMessageListener: (handler: (message: unknown) => void) => () => void
  addSessionEndedListener: (handler: () => void) => () => void
  hasActiveRoute: () => boolean
  emitReceiverMessage: (message: unknown) => void
  emitSessionEnded: () => void
  setActiveRoute: (active: boolean) => void
}

let latestSession: HarnessSession | null = null

function createHarnessSession(): HarnessSession {
  const messageListeners = new Set<(message: unknown) => void>()
  const sessionEndedListeners = new Set<() => void>()
  const route = { active: true }
  const end = vi.fn().mockImplementation(async () => {
    route.active = false
  })

  return {
    sendMessage: async () => {
      queueMicrotask(() => {
        for (const listener of messageListeners) listener({ type: 'render_confirmed' })
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
    hasActiveRoute: () => route.active,
    end,
    emitReceiverMessage: (message) => {
      for (const listener of messageListeners) listener(message)
    },
    emitSessionEnded: () => {
      route.active = false
      for (const listener of sessionEndedListeners) listener()
    },
    setActiveRoute: (active) => {
      route.active = active
    },
  }
}

function TestHarness({
  expandedViewActive = false,
  stageFocusRestoreRef,
  session,
}: {
  expandedViewActive?: boolean
  stageFocusRestoreRef?: RefObject<HTMLButtonElement | null>
  session: HarnessSession
}) {
  const { castStartLifecycle, startCast, stopCast, castToTvButtonRef, stopCastButtonRef } =
    useCastStartSession({
      enabled: true,
      expandedViewActive,
      roomMode: 'theater',
      youtubeVideoId: 'yt-1',
      isPublisher: false,
      hasHostCaptureStream: false,
      hasGuestRelayStream: false,
      chat: [],
      chatMemberLabels: new Map(),
      stageFocusRestoreRef,
      createSenderClient: () => ({
        requestSession: vi.fn().mockResolvedValue(session),
      }),
    })

  return (
    <div>
      <span data-testid="lifecycle">{castStartLifecycle}</span>
      {castStartLifecycle === 'idle' || castStartLifecycle === 'start_failed' ? (
        <button ref={castToTvButtonRef} type="button" data-testid="cast-to-tv" onClick={() => void startCast()}>
          Cast to TV
        </button>
      ) : castStartLifecycle === 'launching' || castStartLifecycle === 'session_pending_render' ? (
        <p data-testid="cast-starting-status">Starting Cast…</p>
      ) : null}
      {castStartLifecycle === 'casting' || castStartLifecycle === 'stopping' || castStartLifecycle === 'stop_failed' ? (
        <button
          ref={stopCastButtonRef}
          type="button"
          data-testid="stop-cast"
          className="riffsync-room-page__cast-stop-button"
          disabled={castStartLifecycle === 'stopping'}
          onClick={() => stopCast()}
        >
          Stop Cast
        </button>
      ) : null}
      {stageFocusRestoreRef ? (
        <button ref={stageFocusRestoreRef} type="button" data-testid="stage-restore">
          Expand view
        </button>
      ) : null}
    </div>
  )
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('useCastStartSession focus transfer', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    latestSession = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderHarness(expandedViewActive = false, withStageRestore = false) {
    const session = createHarnessSession()
    latestSession = session

    function HarnessWrapper() {
      const stageFocusRestoreRef = useRef<HTMLButtonElement | null>(null)
      return (
        <TestHarness
          session={session}
          expandedViewActive={expandedViewActive}
          stageFocusRestoreRef={withStageRestore ? stageFocusRestoreRef : undefined}
        />
      )
    }

    act(() => {
      root.render(
        withStageRestore ? (
          <HarnessWrapper />
        ) : (
          <TestHarness session={session} expandedViewActive={expandedViewActive} />
        ),
      )
    })
  }

  it('moves focus to Stop Cast when Cast to TV still owns focus at success', async () => {
    await renderHarness()

    const castButton = container.querySelector('[data-testid="cast-to-tv"]') as HTMLButtonElement
    act(() => {
      castButton.focus()
    })

    await act(async () => {
      castButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const stopButton = container.querySelector('[data-testid="stop-cast"]') as HTMLButtonElement
    expect(stopButton).not.toBeNull()
    expect(document.activeElement).toBe(stopButton)
  })

  it('does not steal focus when Cast to TV did not own focus at success', async () => {
    await renderHarness()

    const other = document.createElement('button')
    other.type = 'button'
    other.textContent = 'Other'
    document.body.appendChild(other)
    act(() => {
      other.focus()
    })

    const castButton = container.querySelector('[data-testid="cast-to-tv"]') as HTMLButtonElement
    await act(async () => {
      castButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(other)
    other.remove()
  })

  it('does not steal focus when the viewer moves focus elsewhere during startup', async () => {
    await renderHarness()

    const castButton = container.querySelector('[data-testid="cast-to-tv"]') as HTMLButtonElement
    act(() => {
      castButton.focus()
    })

    const other = document.createElement('button')
    other.type = 'button'
    other.textContent = 'Other'
    document.body.appendChild(other)

    await act(async () => {
      castButton.click()
      await Promise.resolve()
    })

    act(() => {
      other.focus()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(other)
    other.remove()
  })

  it('returns lifecycle to idle after stopCast', async () => {
    await renderHarness()

    const castButton = container.querySelector('[data-testid="cast-to-tv"]') as HTMLButtonElement
    await act(async () => {
      castButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('casting')

    const stopButton = container.querySelector('[data-testid="stop-cast"]') as HTMLButtonElement
    await act(async () => {
      stopButton.click()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('idle')
  })

  it('restores focus to the stage control when Stop Cast still owns focus at success', async () => {
    await renderHarness(false, true)

    const castButton = container.querySelector('[data-testid="cast-to-tv"]') as HTMLButtonElement
    await act(async () => {
      castButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const stopButton = container.querySelector('[data-testid="stop-cast"]') as HTMLButtonElement
    act(() => {
      stopButton.focus()
    })

    await act(async () => {
      stopButton.click()
      await Promise.resolve()
    })

    const stageRestore = container.querySelector('[data-testid="stage-restore"]') as HTMLButtonElement
    expect(document.activeElement).toBe(stageRestore)
  })

  it('preserves focus when the viewer moves away from the Cast stage during stopping', async () => {
    await renderHarness(false, true)

    const castButton = container.querySelector('[data-testid="cast-to-tv"]') as HTMLButtonElement
    await act(async () => {
      castButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const stopButton = container.querySelector('[data-testid="stop-cast"]') as HTMLButtonElement
    act(() => {
      stopButton.focus()
    })

    const other = document.createElement('button')
    other.type = 'button'
    other.textContent = 'Chat compose'
    document.body.appendChild(other)

    await act(async () => {
      stopButton.click()
      await Promise.resolve()
    })

    act(() => {
      other.focus()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(document.activeElement).toBe(other)
    other.remove()
  })

  it('restores focus to the stage control when active Cast ends externally', async () => {
    await renderHarness(false, true)

    const castButton = container.querySelector('[data-testid="cast-to-tv"]') as HTMLButtonElement
    await act(async () => {
      castButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const stopButton = container.querySelector('[data-testid="stop-cast"]') as HTMLButtonElement
    act(() => {
      stopButton.focus()
    })

    await act(async () => {
      latestSession?.emitSessionEnded()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const stageRestore = container.querySelector('[data-testid="stage-restore"]') as HTMLButtonElement
    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('session_ended')
    expect(document.activeElement).toBe(stageRestore)
  })

  it('keeps focus on retryable Stop Cast when stop fails with an active route', async () => {
    await renderHarness(false, true)

    const castButton = container.querySelector('[data-testid="cast-to-tv"]') as HTMLButtonElement
    await act(async () => {
      castButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    latestSession?.end.mockRejectedValueOnce(new Error('stop rejected'))

    const stopButton = container.querySelector('[data-testid="stop-cast"]') as HTMLButtonElement
    act(() => {
      stopButton.focus()
    })

    await act(async () => {
      stopButton.click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const retryStopButton = container.querySelector('[data-testid="stop-cast"]') as HTMLButtonElement
    expect(container.querySelector('[data-testid="lifecycle"]')?.textContent).toBe('stop_failed')
    expect(retryStopButton.disabled).toBe(false)
    expect(document.activeElement).toBe(retryStopButton)
  })
})
