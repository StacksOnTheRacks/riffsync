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
vi.mock('./pages/LobbyPage', () => ({ LobbyPage: () => <div>Lobby body</div> }))
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

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('AppRoutes catalog redirects', () => {
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

  function renderAt(path: string) {
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

  it('replace-navigates /catalog/movie-night to the Movies subcategory route', () => {
    renderAt('/catalog/movie-night')
    expect(container.textContent).toContain('Subcategory body')
    expect(container.textContent).not.toContain('Catalog body')
  })

  it('replace-navigates /catalog/riff-ready to /catalog/riff-material', () => {
    renderAt('/catalog/riff-ready')
    expect(container.textContent).toContain('Subcategory body')
  })

  it('resolves /catalog/movies and /catalog/tv-shows as subcategory routes', () => {
    renderAt('/catalog/movies')
    expect(container.textContent).toContain('Subcategory body')

    renderAt('/catalog/tv-shows')
    expect(container.textContent).toContain('Subcategory body')
  })
})
