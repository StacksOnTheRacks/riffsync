// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

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

vi.mock('../../auth/fanTokens', () => ({
  getFanAccessToken: vi.fn(() => null),
}))

vi.mock('../../friends/friendsApi', () => ({
  fetchFriendRosterSnapshot: () => new Promise(() => {}),
}))

vi.mock('../../friends/useRoomFriendsPane', () => ({
  useRoomFriendsPane: () => ({
    loading: false,
    loadError: false,
    snapshot: { friends: [], inbound: [], outbound: [], anyUnread: false },
    openPeer: null,
    dmMessages: [],
    dmClosed: false,
    dmLoading: false,
    dmDraft: '',
    dmComposeError: null,
    removeTarget: null,
    anyUnread: false,
    setDmDraft: () => undefined,
    refreshRoster: () => undefined,
    acceptRequest: () => undefined,
    declineRequest: () => undefined,
    cancelRequest: () => undefined,
    openDm: () => undefined,
    closeDm: () => undefined,
    confirmRemove: () => undefined,
    cancelRemove: () => undefined,
    executeRemove: () => undefined,
    sendDm: () => undefined,
    sendDmGif: () => undefined,
  }),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('AppShell sidebar chrome', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    useFanSession.mockReturnValue({ fanToken: null })
    useShowGetAppNav.mockReturnValue(true)
    useCatalogListQuery.mockReturnValue({ data: [], isPending: false, isError: false })
    mockMatchMedia(false)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  function renderShell() {
    act(() => {
      root.render(
        <MemoryRouter>
          <AppShell>
            <p>Page body</p>
          </AppShell>
        </MemoryRouter>,
      )
    })
  }

  it('toggles desktop rail aria-expanded with Space/Enter and Escape keeps hamburger focus', () => {
    renderShell()

    const hamburger = container.querySelector('.riffsync-app-shell-hamburger') as HTMLButtonElement
    expect(hamburger.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('.riffsync-app-shell--collapsed')).toBeNull()

    act(() => {
      hamburger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })
    expect(hamburger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.riffsync-app-shell--collapsed')).not.toBeNull()

    act(() => {
      hamburger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(hamburger.getAttribute('aria-expanded')).toBe('true')

    act(() => {
      hamburger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.activeElement).toBe(hamburger)
  })

  it('uses overlay drawer on max-width 767px', () => {
    mockMatchMedia(true)
    renderShell()

    expect(container.querySelector('.riffsync-app-shell--mobile')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell-sidebar.is-mobile-open')).toBeNull()

    const hamburger = container.querySelector('.riffsync-app-shell-hamburger') as HTMLButtonElement
    act(() => {
      hamburger.click()
    })

    expect(container.querySelector('.riffsync-app-shell-sidebar.is-mobile-open')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell-drawer-backdrop')).not.toBeNull()
  })

  it('keeps Download App, Your Parties, and header profile reachable when signed in', () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    renderShell()

    expect(container.textContent).toContain('Download App')
    expect(container.querySelector('a[aria-label="Download App"]')).not.toBeNull()
    expect(container.querySelector('a[href="/your-parties"]')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell-profile-trigger')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell-brand img')?.getAttribute('src')).toBe(
      '/app-shell/topbar/logo.svg',
    )
  })
})
