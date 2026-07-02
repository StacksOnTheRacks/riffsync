// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CastStartRoomActions } from './CastStartRoomActions'
import {
  CAST_PLAYBACK_BLOCKED_MESSAGE,
  CAST_SESSION_ENDED_MESSAGE,
  CAST_STARTING_MESSAGE,
  CAST_START_REJECTED_MESSAGE,
  RIFFSYNC_CAST_START_STATUS_ID,
} from './castStartStatusCopy'
import { CAST_UNAVAILABLE_MESSAGE, RIFFSYNC_CAST_AVAILABILITY_STATUS_ID } from './castAvailabilityTypes'
import type { CastStartLifecycle } from './castChannelProtocol'

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
    castStartLifecycle: CastStartLifecycle = 'idle',
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
    renderActions('available', 'launching')
    const status = container.querySelector(`#${RIFFSYNC_CAST_START_STATUS_ID}`)
    expect(status?.textContent).toBe(CAST_STARTING_MESSAGE)
    expect(container.textContent).not.toContain('Cast to TV')
  })

  it('shows starting status while session render is pending', () => {
    renderActions('available', 'session_pending_render')
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

  it('shows session-ended status and retry button', () => {
    renderActions('available', 'session_ended')
    const status = container.querySelector(`#${RIFFSYNC_CAST_START_STATUS_ID}`)
    expect(status?.textContent).toBe(CAST_SESSION_ENDED_MESSAGE)
    expect(container.textContent).toContain('Cast to TV')
  })

  it('shows playback-blocked status and retry button', () => {
    renderActions('available', 'playback_blocked')
    const status = container.querySelector(`#${RIFFSYNC_CAST_START_STATUS_ID}`)
    expect(status?.textContent).toBe(CAST_PLAYBACK_BLOCKED_MESSAGE)
    expect(container.textContent).toContain('Cast to TV')
  })

  it('hides Cast to TV while casting', () => {
    renderActions('available', 'casting')
    expect(container.textContent).not.toContain('Cast to TV')
  })

  it('hides Cast to TV while stopping', () => {
    renderActions('available', 'stopping')
    expect(container.textContent).not.toContain('Cast to TV')
  })

  it('hides Cast to TV while stop failure is retryable on the active stage', () => {
    renderActions('available', 'stop_failed')
    expect(container.textContent).not.toContain('Cast to TV')
  })
})
