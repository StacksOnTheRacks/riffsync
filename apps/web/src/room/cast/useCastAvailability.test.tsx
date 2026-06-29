// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCastAvailability } from './useCastAvailability'
import type { CastAvailabilityState } from './castAvailabilityTypes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Harness({
  enabled,
  detect,
  onState,
}: {
  enabled: boolean
  detect: () => Promise<boolean>
  onState: (state: CastAvailabilityState) => void
}) {
  const state = useCastAvailability(enabled, detect)
  onState(state)
  return <span data-testid="state">{state}</span>
}

describe('useCastAvailability', () => {
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

  it('stays checking while disabled', () => {
    const detect = vi.fn().mockResolvedValue(true)
    act(() => {
      root.render(<Harness enabled={false} detect={detect} onState={() => undefined} />)
    })
    expect(container.querySelector('[data-testid="state"]')?.textContent).toBe('checking')
    expect(detect).not.toHaveBeenCalled()
  })

  it('maps detector success to available', async () => {
    const detect = vi.fn().mockResolvedValue(true)
    act(() => {
      root.render(<Harness enabled={true} detect={detect} onState={() => undefined} />)
    })
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="state"]')?.textContent).toBe('available')
    })
  })

  it('maps detector failure to unavailable', async () => {
    const detect = vi.fn().mockResolvedValue(false)
    act(() => {
      root.render(<Harness enabled={true} detect={detect} onState={() => undefined} />)
    })
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="state"]')?.textContent).toBe('unavailable')
    })
  })

  it('maps detector rejection to unavailable', async () => {
    const detect = vi.fn().mockRejectedValue(new Error('cast probe failed'))
    act(() => {
      root.render(<Harness enabled={true} detect={detect} onState={() => undefined} />)
    })
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="state"]')?.textContent).toBe('unavailable')
    })
  })
})
