// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomVisibilityControl } from './RoomVisibilityControl'

describe('RoomVisibilityControl', () => {
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

  function renderControl(overrides: Partial<Parameters<typeof RoomVisibilityControl>[0]> = {}) {
    const onSelectVisibility = vi.fn()
    act(() => {
      root.render(
        <RoomVisibilityControl
          visibility="public"
          busy={false}
          error={null}
          onSelectVisibility={onSelectVisibility}
          {...overrides}
        />,
      )
    })
    return { onSelectVisibility }
  }

  it('renders lobby visibility options for the room host', () => {
    renderControl()
    expect(container.textContent).toContain('Show in lobby')
    expect(container.textContent).toContain('Link only')
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull()
  })

  it('marks the active visibility option for assistive tech', () => {
    renderControl({ visibility: 'private' })
    const options = container.querySelectorAll('button.riffsync-room-page__visibility-option')
    expect(options[0]?.getAttribute('aria-checked')).toBe('false')
    expect(options[1]?.getAttribute('aria-checked')).toBe('true')
  })

  it('calls onSelectVisibility when the host picks a different option', () => {
    const { onSelectVisibility } = renderControl({ visibility: 'public' })
    const options = container.querySelectorAll('button.riffsync-room-page__visibility-option')
    act(() => {
      ;(options[1] as HTMLButtonElement).click()
    })
    expect(onSelectVisibility).toHaveBeenCalledWith('private')
  })

  it('does not call onSelectVisibility when the active option is clicked again', () => {
    const { onSelectVisibility } = renderControl({ visibility: 'private' })
    const options = container.querySelectorAll('button.riffsync-room-page__visibility-option')
    act(() => {
      ;(options[1] as HTMLButtonElement).click()
    })
    expect(onSelectVisibility).not.toHaveBeenCalled()
  })

  it('disables options while a visibility patch is in flight', () => {
    renderControl({ busy: true })
    const options = container.querySelectorAll('button.riffsync-room-page__visibility-option')
    for (const option of options) {
      expect((option as HTMLButtonElement).disabled).toBe(true)
    }
  })

  it('shows patch errors from the room settings update', () => {
    renderControl({ error: 'Room settings changed elsewhere. Refresh and try again.' })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Refresh')
  })
})
