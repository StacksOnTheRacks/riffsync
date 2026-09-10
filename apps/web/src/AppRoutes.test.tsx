// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './AppRoutes'

vi.mock('./pages/HomePage', () => ({ HomePage: () => <div>Home body</div> }))
vi.mock('./pages/CatalogPage', () => ({ CatalogPage: () => <div>Catalog body</div> }))
vi.mock('./pages/CatalogSubcategoryPage', () => ({
  CatalogSubcategoryPage: () => <div>Subcategory body</div>,
}))
vi.mock('./pages/YourPartiesPage', () => ({
  YourPartiesPage: () => <div>Your parties stub</div>,
}))
vi.mock('./pages/LiveNowPage', () => ({ LiveNowPage: () => <div>Live Now hub body</div> }))
vi.mock('./pages/LiveChannelPage', () => ({ LiveChannelPage: () => <div>Live body</div> }))
vi.mock('./pages/AccountPage', () => ({ AccountPage: () => <div>Account body</div> }))
vi.mock('./pages/RoomPage', () => ({ RoomPage: () => <div>Room body</div> }))
vi.mock('./pages/SoloWatchPage', () => ({ SoloWatchPage: () => <div>Watch body</div> }))
vi.mock('./pages/cast/CastReceiverPage', () => ({ CastReceiverPage: () => <div>Cast body</div> }))
vi.mock('./pages/tv/TvClientPage', () => ({ TvClientPage: () => <div>TV body</div> }))
vi.mock('./pages/DownloadAppPage', () => ({ DownloadAppPage: () => <div>Download body</div> }))
vi.mock('./pages/PrivacyPolicyPage', () => ({ PrivacyPolicyPage: () => <div>Privacy body</div> }))
vi.mock('./pages/TermsOfServicePage', () => ({ TermsOfServicePage: () => <div>Terms body</div> }))
vi.mock('./pages/DataRemovalRequestPage', () => ({
  DataRemovalRequestPage: () => <div>Data removal body</div>,
}))
vi.mock('./pages/HowToHostWatchPartyPage', () => ({
  HowToHostWatchPartyPage: () => <div>Host help body</div>,
}))
vi.mock('./pages/AuthCallbackPage', () => ({ AuthCallbackPage: () => <div>Auth callback</div> }))
vi.mock('./pages/admin/StaffAuthCallbackPage', () => ({
  StaffAuthCallbackPage: () => <div>Staff auth callback</div>,
}))
vi.mock('./pages/admin/AdminLoginPage', () => ({ AdminLoginPage: () => <div>Admin login</div> }))
vi.mock('./pages/admin/StaffAdminGate', () => ({ StaffAdminGate: () => <div>Admin gate</div> }))

const useFanSession = vi.fn()
const useShowGetAppNav = vi.fn()
const useCatalogListQuery = vi.fn()

vi.mock('./auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('./pwa/useShowGetAppNav', () => ({
  useShowGetAppNav: () => useShowGetAppNav(),
}))

vi.mock('./catalog/catalogQueries', () => ({
  useCatalogListQuery: () => useCatalogListQuery(),
  useCatalogCarouselQuery: () => ({ data: [], isPending: false, isError: false }),
  useCatalogSpotlightQuery: () => ({ data: [], isPending: false, isError: false }),
}))

vi.mock('./auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: vi.fn(),
  startFanHostedUiSignOut: vi.fn(),
}))

vi.mock('./auth/fanTokens', () => ({
  getFanAccessToken: vi.fn(() => null),
}))

vi.mock('./friends/useRoomFriendsPane', () => ({
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

vi.mock('./room/RoomChromeProvider', () => ({
  RoomChromeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./room/useVisualViewportRoomShell', () => ({
  useVisualViewportRoomShell: () => ({ className: '', style: undefined }),
}))

vi.mock('./room/useRoomChrome', () => ({
  useRoomChromeOptional: () => null,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('AppRoutes chrome selection', () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    useFanSession.mockReturnValue({ fanToken: null })
    useShowGetAppNav.mockReturnValue(true)
    useCatalogListQuery.mockReturnValue({ data: [], isPending: false, isError: false })
    queryClient = new QueryClient()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderRoute(path: string) {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })
  }

  it('wraps home and catalog routes in AppShell', () => {
    renderRoute('/')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()

    renderRoute('/catalog/mst3k')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()
  })

  it('keeps room on SiteLayout without AppShell', () => {
    renderRoute('/room/demo-room')
    expect(container.querySelector('.riffsync-app-shell')).toBeNull()
    expect(container.querySelector('.riffsync-site--room')).not.toBeNull()
  })

  it('wraps the account page in AppShell', () => {
    renderRoute('/account')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()
    expect(container.textContent).toContain('Account body')
  })

  it('wraps how-to-host in AppShell without the old site header', () => {
    renderRoute('/how-to-host-a-watchparty')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()
    expect(container.textContent).toContain('Host help body')
  })

  it('wraps the Live Now hub at /live in AppShell', () => {
    renderRoute('/live')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.textContent).toContain('Live Now hub body')
  })

  it('wraps the Live Now watch-parties tab in AppShell', () => {
    renderRoute('/live/watch-parties')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.textContent).toContain('Live Now hub body')
  })

  it('wraps live channel in AppShell without the sidebar', () => {
    renderRoute('/live/mst3k-forever-a-thon')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell--no-sidebar')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell-sidebar')).toBeNull()
    expect(container.querySelector('.riffsync-app-shell-hamburger')).toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()
    expect(container.textContent).toContain('Live body')
  })

  it('wraps watch in AppShell without the sidebar', () => {
    renderRoute('/watch/032-mitchell')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell--no-sidebar')).not.toBeNull()
    expect(container.querySelector('.riffsync-app-shell-sidebar')).toBeNull()
    expect(container.querySelector('.riffsync-app-shell-hamburger')).toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()
    expect(container.textContent).toContain('Watch body')
  })

  it('keeps party-capture watch chrome-free', () => {
    renderRoute('/watch/032-mitchell?partyCapture=1')
    expect(container.querySelector('.riffsync-app-shell')).toBeNull()
    expect(container.querySelector('.riffsync-site--party-capture')).not.toBeNull()
    expect(container.textContent).toContain('Watch body')
  })

  it('redirects /lobby to the Live Now hub in AppShell', () => {
    renderRoute('/lobby')
    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.textContent).toContain('Live Now hub body')
  })

  it('keeps cast and tv outside AppShell', () => {
    renderRoute('/cast/receiver')
    expect(container.querySelector('.riffsync-app-shell')).toBeNull()

    renderRoute('/link')
    expect(container.querySelector('.riffsync-app-shell')).toBeNull()

    renderRoute('/tv')
    expect(container.querySelector('.riffsync-app-shell')).toBeNull()
  })

  it('serves the TV pairing page at /link', () => {
    renderRoute('/link')
    expect(container.querySelector('.riffsync-app-shell')).toBeNull()
    expect(container.textContent).toContain('TV body')
  })

  it('redirects /tv to the /link pairing page', () => {
    renderRoute('/tv')
    expect(container.querySelector('.riffsync-app-shell')).toBeNull()
    expect(container.textContent).toContain('TV body')
  })
})
