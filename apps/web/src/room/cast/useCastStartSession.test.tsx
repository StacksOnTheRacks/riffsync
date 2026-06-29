// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCastStartSession } from './useCastStartSession'

function TestHarness({ expandedViewActive = false }: { expandedViewActive?: boolean }) {
  const messageListeners = new Set<(message: unknown) => void>()

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
      createSenderClient: () => ({
        requestSession: vi.fn().mockResolvedValue({
          sendMessage: async () => {
            queueMicrotask(() => {
              for (const listener of messageListeners) listener({ type: 'render_confirmed' })
            })
          },
          addMessageListener: (handler: (message: unknown) => void) => {
            messageListeners.add(handler)
            return () => messageListeners.delete(handler)
          },
          end: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    })

  return (
    <div>
      <span data-testid="lifecycle">{castStartLifecycle}</span>
      {castStartLifecycle === 'idle' || castStartLifecycle === 'start_failed' ? (
        <button ref={castToTvButtonRef} type="button" data-testid="cast-to-tv" onClick={() => void startCast()}>
          Cast to TV
        </button>
      ) : castStartLifecycle === 'starting' ? (
        <p data-testid="cast-starting-status">Starting Cast…</p>
      ) : null}
      {castStartLifecycle === 'casting' ? (
        <button ref={stopCastButtonRef} type="button" data-testid="stop-cast" onClick={() => stopCast()}>
          Stop Cast
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
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function renderHarness(expandedViewActive = false) {
    act(() => {
      root.render(<TestHarness expandedViewActive={expandedViewActive} />)
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
})
