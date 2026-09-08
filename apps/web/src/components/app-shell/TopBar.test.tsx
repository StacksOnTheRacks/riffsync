// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

const useFanSession = vi.fn()
const useShowGetAppNav = vi.fn()
const useCatalogListQuery = vi.fn()

vi.mock('../../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../../pwa/useShowGetAppNav', () => ({
  useShowGetAppNav: () => useShowGetAppNav(),
}))

vi.mock('../../catalog/catalogQueries', () => ({
  useCatalogListQuery: () => useCatalogListQuery(),
}))

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: vi.fn(),
  startFanHostedUiSignOut: vi.fn(),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('TopBar Figma chrome', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useFanSession.mockReturnValue({ fanToken: null })
    useShowGetAppNav.mockReturnValue(true)
    useCatalogListQuery.mockReturnValue({ data: [], isPending: false, isError: false })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderBar() {
    act(() => {
      root.render(
        <MemoryRouter>
          <TopBar sidebarExpanded onToggleSidebar={() => undefined} />
        </MemoryRouter>,
      )
    })
  }

  it('uses the Figma logo and unauthenticated help plus sign-in icons', () => {
    renderBar()

    expect(container.querySelector('.riffsync-app-shell-brand img')?.getAttribute('src')).toBe(
      '/app-shell/topbar/logo.svg',
    )
    expect(container.querySelector('input')?.getAttribute('placeholder')).toBe('Search')
    expect(container.querySelector('.riffsync-app-shell-search-submit')).not.toBeNull()
    expect(container.querySelector('a[aria-label="How to Host"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Sign In"]')).not.toBeNull()
    expect(container.querySelector('a[aria-label="Download App"]')).toBeNull()
    expect(container.querySelector('.riffsync-app-shell-profile-trigger')).toBeNull()
  })

  it('adds apps and profile chrome when signed in', () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    renderBar()

    expect(container.querySelector('a[aria-label="Download App"] img')?.getAttribute('src')).toBe(
      '/app-shell/topbar/apps.svg',
    )
    expect(container.querySelector('a[aria-label="How to Host"]')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell-profile-trigger')).not.toBeNull()
    expect(container.querySelector('[aria-label="Sign In"]')).toBeNull()
  })
})
