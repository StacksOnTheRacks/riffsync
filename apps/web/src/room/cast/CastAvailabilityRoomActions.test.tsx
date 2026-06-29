// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CastAvailabilityRoomActions } from './CastAvailabilityRoomActions'
import {
  CAST_UNAVAILABLE_MESSAGE,
  RIFFSYNC_CAST_AVAILABILITY_STATUS_ID,
} from './castAvailabilityTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CastAvailabilityRoomActions', () => {
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

  function renderActions(castAvailability: 'checking' | 'available' | 'unavailable') {
    act(() => {
      root.render(
        <CastAvailabilityRoomActions castAvailability={castAvailability} onCastToTvClick={vi.fn()} />,
      )
    })
  }

  it('renders nothing while checking', () => {
    renderActions('checking')
    expect(container.textContent).toBe('')
  })

  it('renders Cast to TV when available', () => {
    renderActions('available')
    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Cast to TV')
    expect(button?.className).toContain('gen-button-wide')
  })

  it('renders local unavailable status when support is absent', () => {
    renderActions('unavailable')
    const status = container.querySelector(`#${RIFFSYNC_CAST_AVAILABILITY_STATUS_ID}`)
    expect(status).not.toBeNull()
    expect(status?.getAttribute('role')).toBe('status')
    expect(status?.textContent).toBe(CAST_UNAVAILABLE_MESSAGE)
    expect(container.querySelector('button')).toBeNull()
  })
})
