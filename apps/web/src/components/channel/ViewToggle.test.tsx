// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ViewToggle } from './ViewToggle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ViewToggle', () => {
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

  it('exposes role=group with accessible name and aria-pressed defaults', () => {
    act(() => {
      root.render(<ViewToggle view="cards" onViewChange={() => undefined} />)
    })

    const group = container.querySelector('[role="group"]')
    expect(group?.getAttribute('aria-label')).toBe('View mode')
    expect(container.querySelector('[aria-label="Cards"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('[aria-label="List"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('.riffsync-view-toggle__label')).toBeNull()
    expect(container.querySelector('[aria-label="List"] img')?.getAttribute('src')).toBe(
      '/app-shell/channel/view-list.svg',
    )
    expect(container.querySelector('[aria-label="Cards"] img')?.getAttribute('src')).toBe(
      '/app-shell/channel/view-cards.svg',
    )
  })

  it('calls onViewChange when List is clicked', () => {
    let nextView: 'cards' | 'list' = 'cards'
    act(() => {
      root.render(
        <ViewToggle
          view={nextView}
          onViewChange={(view) => {
            nextView = view
          }}
        />,
      )
    })

    const listButton = container.querySelector('[aria-label="List"]') as HTMLButtonElement
    act(() => {
      listButton.click()
    })
    expect(nextView).toBe('list')
  })
})
