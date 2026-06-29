// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CastStartRoomActions } from './CastStartRoomActions'
import {
  CAST_STARTING_MESSAGE,
  CAST_START_REJECTED_MESSAGE,
  RIFFSYNC_CAST_START_STATUS_ID,
} from './castStartStatusCopy'
import { CAST_UNAVAILABLE_MESSAGE, RIFFSYNC_CAST_AVAILABILITY_STATUS_ID } from './castAvailabilityTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CastStartRoomActions', () => {
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

  function renderActions(
    castAvailability: 'checking' | 'available' | 'unavailable',
    castStartLifecycle: 'idle' | 'starting' | 'casting' | 'start_failed' = 'idle',
  ) {
    act(() => {
      root.render(
        <CastStartRoomActions
          castAvailability={castAvailability}
          castStartLifecycle={castStartLifecycle}
          onCastToTvClick={vi.fn()}
        />,
      )
    })
  }

  it('renders Cast to TV when available and idle', () => {
    renderActions('available', 'idle')
    expect(container.textContent).toContain('Cast to TV')
  })

  it('shows starting status without replacing playback surfaces', () => {
    renderActions('available', 'starting')
    const status = container.querySelector(`#${RIFFSYNC_CAST_START_STATUS_ID}`)
    expect(status?.textContent).toBe(CAST_STARTING_MESSAGE)
    expect(container.textContent).not.toContain('Cast to TV')
  })

  it('shows rejected status and retry button', () => {
    renderActions('available', 'start_failed')
    const status = container.querySelector(`#${RIFFSYNC_CAST_START_STATUS_ID}`)
    expect(status?.textContent).toBe(CAST_START_REJECTED_MESSAGE)
    expect(container.textContent).toContain('Cast to TV')
  })

  it('shows unavailable copy when sender support is missing', () => {
    renderActions('unavailable')
    const status = container.querySelector(`#${RIFFSYNC_CAST_AVAILABILITY_STATUS_ID}`)
    expect(status?.textContent).toBe(CAST_UNAVAILABLE_MESSAGE)
  })
})
