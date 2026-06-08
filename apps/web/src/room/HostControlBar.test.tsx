// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HostControlBar } from './HostControlBar'

describe('HostControlBar', () => {
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

  function renderBar(overrides: Partial<Parameters<typeof HostControlBar>[0]> = {}) {
    const onSelectRoomMode = vi.fn()
    const onToggleAvDisabled = vi.fn()
    act(() => {
      root.render(
        <HostControlBar
          roomMode="theater"
          avDisabled={false}
          busy={false}
          error={null}
          onSelectRoomMode={onSelectRoomMode}
          onToggleAvDisabled={onToggleAvDisabled}
          {...overrides}
        />,
      )
    })
    return { onSelectRoomMode, onToggleAvDisabled }
  }

  it('does not render when parent omits bar for non-host viewers', () => {
    const isHost = false
    act(() => {
      root.render(
        isHost ? (
          <HostControlBar
            roomMode="theater"
            avDisabled={false}
            busy={false}
            error={null}
            onSelectRoomMode={vi.fn()}
            onToggleAvDisabled={vi.fn()}
          />
        ) : null,
      )
    })
    expect(container.querySelector('.riffsync-room-page__host-bar')).toBeNull()
  })

  it('renders host layout and kill switch for room host', () => {
    renderBar()
    expect(container.textContent).toContain('Theater')
    expect(container.textContent).toContain('Video Chat')
    expect(container.textContent).toContain('Disable room A/V')
  })

  it('marks Video Chat inert when avDisabled kill switch is on', () => {
    renderBar({ avDisabled: true })
    const modeButtons = container.querySelectorAll('button.riffsync-room-page__host-bar-mode')
    expect(modeButtons.length).toBe(2)
    expect(modeButtons[1]?.getAttribute('aria-disabled')).toBe('true')
  })

  it('exposes kill switch pressed state to assistive tech', () => {
    renderBar({ avDisabled: true })
    const kill = container.querySelector('.riffsync-room-page__host-bar-kill') as HTMLButtonElement
    expect(kill.getAttribute('aria-pressed')).toBe('true')
  })

  it('exposes room mode radio selection to assistive tech', () => {
    renderBar({ roomMode: 'videoChat' })
    const modeButtons = container.querySelectorAll('button.riffsync-room-page__host-bar-mode')
    expect(modeButtons[0]?.getAttribute('aria-checked')).toBe('false')
    expect(modeButtons[1]?.getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull()
  })
})
