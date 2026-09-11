// @vitest-environment happy-dom
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './AppRoutes'

vi.mock('./auth/FanSessionKeepAlive', () => ({
  FanSessionKeepAlive: () => null,
}))

vi.mock('./auth/useFanSession', () => ({
  useFanSession: () => ({ fanToken: 'fan-token' }),
}))

vi.mock('./pages/AccountPage', () => ({
  AccountPage: () => <p>RiffSync Account Settings</p>,
}))

vi.mock('./room/RoomChromeProvider', () => ({
  RoomChromeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('./room/useRoomChrome', () => ({
  useRoomChromeOptional: () => null,
}))

vi.mock('./pwa/useShowGetAppNav', () => ({
  useShowGetAppNav: () => false,
}))

vi.mock('./catalog/catalogQueries', () => ({
  useCatalogListQuery: () => ({ data: [], isPending: false, isError: false }),
  useCatalogCarouselQuery: () => ({ data: [], isPending: false, isError: false }),
  useCatalogSpotlightQuery: () => ({ data: [], isPending: false, isError: false }),
}))

vi.mock('./auth/fanAuthNavigation', () => ({
  navigateToFanAuth: vi.fn(),
}))

vi.mock('./auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignOut: vi.fn(),
  refreshFanTokensIfStale: vi.fn(),
}))

vi.mock('./auth/fanTokens', () => ({
  getFanAccessToken: vi.fn(() => 'fan-token'),
  getFanRefreshToken: vi.fn(() => 'refresh-token'),
}))

vi.mock('./api/fanProfileApi', () => ({
  fetchFanProfile: () =>
    Promise.resolve({
      displayName: 'Account',
      updatedAt: 1,
      avatarUrl: null,
      avatarUpdatedAt: null,
    }),
}))

vi.mock('./friends/friendsApi', () => ({
  fetchFriendRosterSnapshot: () => new Promise(() => {}),
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

describe('AppRoutes fan account route', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  afterEach(() => {
    root?.unmount()
    root = null
    container?.remove()
  })

  it('renders AccountPage under AppShell', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const queryClient = new QueryClient()

    act(() => {
      root!.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/account']}>
            <AppRoutes />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain('RiffSync Account Settings')
    })

    expect(container.querySelector('.riffsync-app-shell')).not.toBeNull()
    expect(container.querySelector('#gen-header')).toBeNull()
    expect(container.querySelector('a[href="/account"]')).not.toBeNull()
  })
})
