// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CATALOG_HUB_ENTRY_LINKS,
  MST3K_ERA_NAV_LINKS,
  MST3K_SEASON_NAV_LINKS,
  MST3K_SHORTS_NAV_LINK,
  RIFFTRAX_MOVIES_NAV_LINK,
  RIFFTRAX_SHORTS_NAV_LINK,
} from '../../catalog/catalogBrowseIa'
import { SiteHeader } from './SiteHeader'

const startFanHostedUiSignIn = vi.fn<(returnPath: string) => Promise<void>>()
const useFanSession = vi.fn()
const useShowGetAppNav = vi.fn()
const getFanAccessToken = vi.fn<() => string | null>()

vi.mock('../../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: (returnPath: string) => startFanHostedUiSignIn(returnPath),
}))

vi.mock('../../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../../auth/fanTokens', () => ({
  getFanAccessToken: () => getFanAccessToken(),
}))

vi.mock('../../pwa/useShowGetAppNav', () => ({
  useShowGetAppNav: () => useShowGetAppNav(),
}))

vi.mock('../../room/useRoomChrome', () => ({
  useRoomChromeOptional: () => null,
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

describe('SiteHeader fan session nav', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    startFanHostedUiSignIn.mockReset()
    startFanHostedUiSignIn.mockResolvedValue(undefined)
    useShowGetAppNav.mockReturnValue(true)
    getFanAccessToken.mockReturnValue(null)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderHeader(path = '/catalog') {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <SiteHeader />
        </MemoryRouter>,
      )
    })
  }

  it('shows Sign In when anonymous', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderHeader('/catalog?era=joel')

    expect(container.querySelector('a[href="/account"]')).toBeNull()
    expect(container.querySelector('.riffsync-friends-nav')).toBeNull()
    expect(container.textContent).toContain('Sign In')
    expect(container.textContent).toContain('Lobby')
    expect(container.querySelector('a[href="/live/mst3k-forever-a-thon"]')).toBeNull()
    expect(container.textContent).not.toContain('Live')
    expect(container.querySelector('a[href="/download"]')?.textContent).toBe('Get App')
  })

  it('starts Hosted UI sign-in with the current path', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderHeader('/lobby')

    const signIn = container.querySelector('.riffsync-site-nav-sign-in') as HTMLButtonElement
    act(() => {
      signIn.click()
    })

    expect(startFanHostedUiSignIn).toHaveBeenCalledWith('/lobby')
  })

  it('shows Account link and person-icon friends control when signed in (#363)', () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    getFanAccessToken.mockReturnValue('fan-token')
    renderHeader()

    expect(container.querySelector('a[href="/account"]')?.textContent).toBe('Account')
    expect(container.querySelector('.riffsync-site-nav-sign-in')).toBeNull()
    expect(container.querySelector('.riffsync-friends-nav')).not.toBeNull()
    expect(container.querySelector('#gen-user-btn')).not.toBeNull()
    expect(container.querySelector('.fa-user')).not.toBeNull()
  })

  it('does not render main-site friends affordance when signed out (#365)', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    getFanAccessToken.mockReturnValue(null)
    renderHeader('/catalog')

    expect(container.querySelector('.riffsync-friends-nav')).toBeNull()
    expect(container.querySelector('#gen-user-btn')).toBeNull()
    expect(container.querySelector('[aria-label="Friends"]')).toBeNull()
  })

  it('hides Get App when the site is running as an installed PWA', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    useShowGetAppNav.mockReturnValue(false)
    renderHeader('/catalog')

    expect(container.querySelector('a[href="/download"]')).toBeNull()
    expect(container.textContent).not.toContain('Get App')
  })

  it('renders catalog nav chrome inside navbar-collapse', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderHeader('/catalog')

    const collapse = container.querySelector('#navbarSupportedContent')
    const catalogNav = container.querySelector('.riffsync-catalog-nav')

    expect(collapse?.contains(catalogNav)).toBe(true)
    expect(catalogNav?.classList.contains('menu-item-has-children')).toBe(true)
    const expectedCatalogLinks = [
      ...CATALOG_HUB_ENTRY_LINKS.map(({ href }) => href),
      ...MST3K_SEASON_NAV_LINKS.map(({ href }) => href),
      ...MST3K_ERA_NAV_LINKS.map(({ href }) => href),
      MST3K_SHORTS_NAV_LINK.href,
      RIFFTRAX_MOVIES_NAV_LINK.href,
      RIFFTRAX_SHORTS_NAV_LINK.href,
    ]

    expect(container.querySelectorAll('.riffsync-catalog-nav > .sub-menu a')).toHaveLength(
      expectedCatalogLinks.length,
    )
    expect(container.querySelectorAll('a[href="/catalog"]')).toHaveLength(1)
    expect(expectedCatalogLinks.every((href) => container.querySelector(`a[href="${href}"]`))).toBe(true)
  })
})
