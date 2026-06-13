// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatLogStickToBottom } from './useChatLogStickToBottom'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// `isChatLogNearBottom` reads live layout metrics that happy-dom does not
// compute, so we drive it from a mutable flag and stub the smooth scroll.
let nearBottom = true
const scrollSpy = vi.fn()

vi.mock('./chatLogScroll', () => ({
  isChatLogNearBottom: () => nearBottom,
  scrollChatLogToBottom: (el: HTMLElement) => scrollSpy(el),
}))

function Harness({ chatLength, chatTabActive }: { chatLength: number; chatTabActive: boolean }) {
  const { logRef, showJumpToLatest, jumpToLatestLabel, jumpToLatest } = useChatLogStickToBottom(
    chatLength,
    chatTabActive,
  )
  return (
    <div>
      <ul ref={logRef} data-testid="log" />
      {showJumpToLatest ? (
        <button type="button" data-testid="jump" onClick={jumpToLatest}>
          {jumpToLatestLabel}
        </button>
      ) : null}
    </div>
  )
}

describe('useChatLogStickToBottom', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    nearBottom = true
    scrollSpy.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function render(chatLength: number, chatTabActive = true) {
    act(() => {
      root.render(<Harness chatLength={chatLength} chatTabActive={chatTabActive} />)
    })
  }

  function fireScroll() {
    const log = container.querySelector('[data-testid="log"]') as HTMLElement
    act(() => {
      log.dispatchEvent(new Event('scroll'))
    })
  }

  function jumpButton() {
    return container.querySelector('[data-testid="jump"]') as HTMLButtonElement | null
  }

  function settleProgrammaticScroll() {
    // The mount-time auto-stick scroll leaves a programmatic-scroll guard armed;
    // a near-bottom scroll event represents that scroll landing and clears it.
    nearBottom = true
    fireScroll()
  }

  it('keeps stick-to-bottom while our own smooth scroll is mid-flight (regression)', () => {
    render(1)
    settleProgrammaticScroll()

    // New line arrives while pinned. The smooth scroll has not landed yet, so the
    // log momentarily measures as "not near bottom" - this must not unstick us.
    nearBottom = false
    render(2)
    fireScroll()

    // A second line arrives during the same animation window.
    render(3)

    expect(jumpButton()).toBeNull()

    // Animation lands at the bottom: still no jump affordance.
    nearBottom = true
    fireScroll()
    expect(jumpButton()).toBeNull()
  })

  it('shows the jump affordance once the user genuinely scrolls up', () => {
    render(1)
    settleProgrammaticScroll()

    // User scrolls up away from the bottom.
    nearBottom = false
    fireScroll()

    render(2)
    expect(jumpButton()?.textContent).toBe('New messages')

    render(3)
    expect(jumpButton()?.textContent).toBe('New messages (2)')
  })

  it('jump-to-latest clears the pending affordance', () => {
    render(1)
    settleProgrammaticScroll()
    nearBottom = false
    fireScroll()
    render(2)

    const button = jumpButton()
    expect(button).not.toBeNull()
    act(() => button!.click())

    expect(jumpButton()).toBeNull()
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('hides the affordance when the chat tab is not active', () => {
    render(1, false)
    nearBottom = false
    fireScroll()
    render(2, false)
    expect(jumpButton()).toBeNull()
  })
})
