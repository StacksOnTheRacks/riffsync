// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NavigationSlim } from './NavigationSlim'

describe('NavigationSlim', () => {
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

  it('renders title and leave control with accessible name', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <NavigationSlim title="MST3K Episode 1" subtitle="Host" />
        </MemoryRouter>,
      )
    })
    expect(container.querySelector('.riffsync-navigation-slim')).not.toBeNull()
    expect(container.textContent).toContain('MST3K Episode 1')
    expect(container.textContent).toContain('Host')
    const leave = container.querySelector('.riffsync-navigation-slim__leave') as HTMLAnchorElement
    expect(leave.getAttribute('aria-label')).toBe('Leave party')
    expect(leave.getAttribute('href')).toBe('/lobby')
  })
})
