// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MineRoomsResponse } from '../api/roomsApi'
import { AppShell } from '../components/app-shell/AppShell'
import { STATIC_INDEXABLE_ROUTES } from '../seo/indexableRoutes'
import { YourPartiesPage } from './YourPartiesPage'

const startFanHostedUiSignIn = vi.fn<(returnPath: string) => Promise<void>>()
const useFanSession = vi.fn()
const fetchRoomsMine = vi.fn<(token: string) => Promise<MineRoomsResponse>>()
const patchRoom = vi.fn()

vi.mock('../auth/fanHostedUiPkce', () => ({
  startFanHostedUiSignIn: (returnPath: string) => startFanHostedUiSignIn(returnPath),
  startFanHostedUiSignOut: vi.fn(),
}))

vi.mock('../auth/useFanSession', () => ({
  useFanSession: () => useFanSession(),
}))

vi.mock('../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/roomsApi')>()
  return {
    ...actual,
    fetchRoomsMine: (token: string) => fetchRoomsMine(token),
    patchRoom: (...args: unknown[]) => patchRoom(...args),
  }
})

vi.mock('../config/publicOrigin', () => ({
  getPublicOrigin: () => 'https://riffsync.tv',
}))

vi.mock('../pwa/useShowGetAppNav', () => ({
  useShowGetAppNav: () => false,
}))

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogListQuery: () => ({ data: { entries: [] }, isPending: false }),
}))

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: vi.fn(() => 'fan-token'),
}))

vi.mock('../friends/friendsApi', () => ({
  fetchFriendRosterSnapshot: () => new Promise(() => {}),
}))

vi.mock('../friends/useRoomFriendsPane', () => ({
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

function roomsResponse(rooms: MineRoomsResponse['rooms']): MineRoomsResponse {
  return { rooms }
}

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

describe('YourPartiesPage', () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    startFanHostedUiSignIn.mockReset()
    fetchRoomsMine.mockReset()
    patchRoom.mockReset()
    startFanHostedUiSignIn.mockResolvedValue(undefined)
    mockMatchMedia(false)
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    queryClient.clear()
  })

  function renderInAppShell(initialPath = '/your-parties') {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route
                path="/your-parties"
                element={
                  <AppShell>
                    <YourPartiesPage />
                  </AppShell>
                }
              />
              <Route path="/room/:roomId" element={<div data-testid="room-page" />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })
  }

  it('starts sign in when signed out and does not call rooms/mine', () => {
    useFanSession.mockReturnValue({ fanToken: null })
    renderInAppShell()

    expect(startFanHostedUiSignIn).toHaveBeenCalledWith('/your-parties')
    expect(fetchRoomsMine).not.toHaveBeenCalled()
  })

  it('calls GET /v1/rooms/mine with Bearer and renders cards in API order inside main', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchRoomsMine.mockResolvedValue(
      roomsResponse([
        {
          roomId: 'room-a',
          displayTitle: 'Alpha Party',
          catalogEpisodeId: '101-the-crawling-eye',
          lastActivityAt: 9000,
          visibility: 'public',
        },
        {
          roomId: 'room-b',
          displayTitle: 'Beta Party',
          catalogEpisodeId: '102-the-lost-continent',
          lastActivityAt: 8000,
          visibility: 'private',
        },
      ]),
    )

    renderInAppShell()

    await vi.waitFor(() => {
      expect(fetchRoomsMine).toHaveBeenCalledWith('fan-token')
    })

    await vi.waitFor(() => {
      expect(container.querySelector('#riffsync-main .riffsync-channel-hero')).not.toBeNull()
      expect(container.querySelectorAll('.riffsync-watch-party-card__title')).toHaveLength(2)
    })

    const titles = [...container.querySelectorAll('.riffsync-watch-party-card__title')].map(
      (node) => node.textContent,
    )
    expect(titles).toEqual(['Alpha Party', 'Beta Party'])
    expect(container.querySelector('.riffsync-view-toggle')).toBeNull()
    expect(container.textContent).not.toContain('Subscribe')
    expect(container.textContent).not.toContain('Subscribers')
    expect(container.querySelector('.riffsync-watch-party-card img')).toBeNull()
  })

  it('renders exactly one h1 with Your Watch Parties on happy path', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchRoomsMine.mockResolvedValue(
      roomsResponse([
        {
          roomId: 'room-a',
          displayTitle: 'Alpha Party',
          catalogEpisodeId: '101-the-crawling-eye',
          lastActivityAt: 9000,
          visibility: 'public',
        },
      ]),
    )

    renderInAppShell()

    await vi.waitFor(() => {
      const headings = container.querySelectorAll('h1')
      expect(headings).toHaveLength(1)
      expect(headings[0]?.textContent).toBe('Your Watch Parties')
    })
  })

  it('shows empty state with 0 Parties', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchRoomsMine.mockResolvedValue(roomsResponse([]))

    renderInAppShell()

    await vi.waitFor(() => {
      expect(container.textContent).toContain("You don't host any parties yet.")
      expect(container.textContent).toContain('0 Parties')
    })

    const headings = container.querySelectorAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Your Watch Parties')
  })

  it('shows loading aria-busy and keeps hero', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchRoomsMine.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    )

    renderInAppShell()

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-channel-hero')).not.toBeNull()
      expect(container.querySelector('.riffsync-your-parties-page__cards')?.getAttribute('aria-busy')).toBe(
        'true',
      )
    })
  })

  it('shows error with Retry and re-fetches', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchRoomsMine.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(
      roomsResponse([
        {
          roomId: 'room-a',
          displayTitle: 'Alpha Party',
          catalogEpisodeId: '101-the-crawling-eye',
          lastActivityAt: 9000,
          visibility: 'public',
        },
      ]),
    )

    renderInAppShell()

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Couldn't load your parties")
    })

    act(() => {
      ;(container.querySelector('.riffsync-your-parties-page__retry') as HTMLButtonElement).click()
    })

    await vi.waitFor(() => {
      expect(fetchRoomsMine).toHaveBeenCalledTimes(2)
      expect(container.textContent).toContain('Alpha Party')
    })
  })

  it('navigates to room from card without PATCH', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchRoomsMine.mockResolvedValue(
      roomsResponse([
        {
          roomId: 'room-a',
          displayTitle: 'Alpha Party',
          catalogEpisodeId: '101-the-crawling-eye',
          lastActivityAt: 9000,
          visibility: 'public',
        },
      ]),
    )

    renderInAppShell()

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-watch-party-card__title-link')).not.toBeNull()
    })

    act(() => {
      ;(container.querySelector('.riffsync-watch-party-card__title-link') as HTMLAnchorElement).click()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="room-page"]')).not.toBeNull()
    })
    expect(patchRoom).not.toHaveBeenCalled()
  })

  it('copy URL writes first-party join URL', async () => {
    useFanSession.mockReturnValue({ fanToken: 'fan-token' })
    fetchRoomsMine.mockResolvedValue(
      roomsResponse([
        {
          roomId: 'room-a',
          displayTitle: 'Alpha Party',
          catalogEpisodeId: '101-the-crawling-eye',
          lastActivityAt: 9000,
          visibility: 'public',
        },
      ]),
    )

    renderInAppShell()

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-watch-party-card__copy')).not.toBeNull()
    })

    await act(async () => {
      ;(container.querySelector('.riffsync-watch-party-card__copy') as HTMLButtonElement).click()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://riffsync.tv/room/room-a')
  })

  it('is absent from STATIC_INDEXABLE_ROUTES', () => {
    expect(STATIC_INDEXABLE_ROUTES.includes('/your-parties' as never)).toBe(false)
  })

  it('stacks cards in a single column below 767px via stylesheet rule', () => {
    const cssPath = resolve(import.meta.dirname, '../styles/your-parties.css')
    const css = readFileSync(cssPath, 'utf8')
    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('grid-template-columns: 1fr')
  })
})
