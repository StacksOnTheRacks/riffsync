// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CastActiveStagePanel } from './CastActiveStagePanel'
import {
  CAST_ACTIVE_HEADING,
  CAST_ACTIVE_SUBCOPY,
  CAST_STOPPING_SUBCOPY,
  CAST_STOP_BUTTON_LABEL,
  RIFFSYNC_CAST_ACTIVE_STATUS_ID,
} from './castActiveStatusCopy'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CastActiveStagePanel', () => {
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

  it('renders Now Casting copy and Stop Cast control', () => {
    act(() => {
      root.render(<CastActiveStagePanel onStopCast={vi.fn()} />)
    })

    expect(container.textContent).toContain(CAST_ACTIVE_HEADING)
    expect(container.textContent).toContain(CAST_ACTIVE_SUBCOPY)
    expect(container.textContent).toContain(CAST_STOP_BUTTON_LABEL)

    const status = container.querySelector(`#${RIFFSYNC_CAST_ACTIVE_STATUS_ID}`)
    expect(status?.getAttribute('role')).toBe('status')
    expect(status?.getAttribute('aria-live')).toBe('polite')
  })

  it('invokes onStopCast when Stop Cast is activated', () => {
    const onStopCast = vi.fn()
    act(() => {
      root.render(<CastActiveStagePanel onStopCast={onStopCast} />)
    })

    const stopButton = container.querySelector('.riffsync-room-page__cast-stop-button') as HTMLButtonElement
    act(() => {
      stopButton.click()
    })

    expect(onStopCast).toHaveBeenCalledTimes(1)
  })

  it('associates Stop Cast with the Now Casting heading', () => {
    act(() => {
      root.render(<CastActiveStagePanel onStopCast={vi.fn()} />)
    })

    const stopButton = container.querySelector('.riffsync-room-page__cast-stop-button') as HTMLButtonElement
    expect(stopButton.getAttribute('aria-describedby')).toBe('riffsync-cast-active-heading')
  })

  it('shows stopping copy and disables Stop Cast while stopping', () => {
    act(() => {
      root.render(<CastActiveStagePanel onStopCast={vi.fn()} stopping />)
    })

    expect(container.textContent).toContain(CAST_STOPPING_SUBCOPY)
    expect(container.textContent).not.toContain(CAST_ACTIVE_SUBCOPY)

    const stopButton = container.querySelector('.riffsync-room-page__cast-stop-button') as HTMLButtonElement
    expect(stopButton.disabled).toBe(true)
    expect(stopButton.getAttribute('aria-disabled')).toBe('true')
  })
})
