// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomPage } from './RoomPage'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import { ChatSession } from '../room/sessions/ChatSession'
import { SfuMediaSession } from '../room/sessions/SfuMediaSession'
import { TheaterPlayback } from '../room/sessions/TheaterPlayback'

function mockFanJwt(sub = 'host-sub'): string {
  const payload = btoa(JSON.stringify({ sub }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`
}

vi.mock('../hostBridge/hostExtensionBridge', () => ({
  pingHostExtension: vi.fn().mockResolvedValue(false),
  getHostMediaTabState: vi.fn().mockResolvedValue({
    bound: false,
    roomId: null,
    origin: null,
    mediaTabOpen: false,
    mediaTabId: null,
    mediaTabUrl: null,
    mediaPlaybackControllable: false,
  }),
  openHostMediaTab: vi.fn(),
  sendHostMediaPlayback: vi.fn(),
}))

const fetchRoom = vi.fn()
const patchRoom = vi.fn()
const fetchRtcIceServers = vi.fn()
const fanTokenState = vi.hoisted(() => ({ value: mockFanJwt('host-sub') as string | null }))

vi.mock('../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/roomsApi')>()
  return {
    ...actual,
    fetchRoom: (...args: unknown[]) => fetchRoom(...args),
    patchRoom: (...args: unknown[]) => patchRoom(...args),
  }
})

vi.mock('../config/fetchRtcIceServers', () => ({
  fetchRtcIceServers: () => fetchRtcIceServers(),
}))

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogEpisodeQuery: () => ({ data: { title: 'Test Episode' } }),
  useCatalogListQuery: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
}))

vi.mock('../auth/fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/fanTokens')>()
  return {
    ...actual,
    getFanAccessToken: () => fanTokenState.value,
  }
})

vi.mock('../api/fanProfileApi', () => ({
  fetchFanProfile: vi.fn().mockResolvedValue({
    displayName: 'Account',
    updatedAt: 1,
    avatarUrl: null,
    avatarUpdatedAt: null,
  }),
}))

vi.mock('../config/wsUrl', () => ({ getPublicWsUrl: () => 'wss://ws.test.example' }))
vi.mock('../config/apiBaseUrl', () => ({ getPublicApiBaseUrl: () => 'https://api.test.example' }))
vi.mock('../config/publicOrigin', () => ({ getPublicOrigin: () => 'https://www.test.example' }))
vi.mock('../room/cast/useCastAvailability', () => ({ useCastAvailability: () => 'available' }))
vi.mock('../session/guestSession', () => ({
  ensureGuestSession: () => ({ sessionId: 'sess-host', displayName: 'Host' }),
  setGuestDisplayName: (name: string) => name,
  FAN_DISPLAY_NAME_MAX_LEN: 48,
}))

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  readyState = MockWebSocket.OPEN
  url: string
  private listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      for (const fn of this.listeners.get('open') ?? []) fn({})
    })
  }

  addEventListener(type: string, fn: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(fn)
  }

  removeEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.get(type)?.delete(fn)
  }

  send() {}
  close() {
    this.readyState = MockWebSocket.CLOSED
  }
}

describe('RoomPage host theater chrome', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    fanTokenState.value = mockFanJwt('host-sub')
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    fetchRtcIceServers.mockResolvedValue([{ urls: 'stun:stun.test' }])
    patchRoom.mockResolvedValue({
      roomId: 'room-test-1',
      version: 2,
      visibility: 'public',
      displayTitle: 'Saved Party',
      catalogEpisodeId: 'ep-1',
      youtubeVideoId: 'yt-1',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
    })
    fetchRoom.mockResolvedValue({
      roomId: 'room-test-1',
      hostSub: 'host-sub',
      catalogEpisodeId: 'ep-1',
      youtubeVideoId: 'yt-1',
      version: 1,
      visibility: 'public',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      roomMode: 'theater',
      avDisabled: false,
      broadcastCaptureActive: false,
      displayTitle: 'Party',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.spyOn(ChatSession.prototype, 'disconnect')
    vi.spyOn(SfuMediaSession.prototype, 'disconnect')
    vi.spyOn(TheaterPlayback.prototype, 'dispose')
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('renders NavigationSlim, Chatbox, and HostTheaterButtonBar for host media mode', async () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/room/room-test-1']}>
          <RoomChromeProvider>
            <Routes>
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
          </RoomChromeProvider>
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-navigation-slim')).not.toBeNull()
    })

    expect(container.querySelector('.riffsync-chatbox')).not.toBeNull()
    expect(container.querySelector('.riffsync-host-theater-bar')).not.toBeNull()
    expect(container.querySelector('[aria-label="Load media"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Broadcast"]')).not.toBeNull()
    expect(container.querySelector('.riffsync-room-page__host-bar')).toBeNull()
    expect(container.querySelector('[data-testid="room-sidebar-av"]')).toBeNull()
    expect(container.textContent).not.toContain('Disable room A/V')
    expect(container.textContent).not.toMatch(/\bTHEATER\b/)
    expect(container.textContent).not.toContain('VIDEO CHAT')

    const logo = container.querySelector('.riffsync-navigation-slim__logo') as HTMLAnchorElement
    expect(logo.getAttribute('href')).toBe('/')
    expect(container.textContent).not.toContain('Leave party')
    expect(container.querySelector('.riffsync-navigation-slim__leave')).toBeNull()
    const headings = container.querySelectorAll('h1.sr-only')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Party')
  })

  it('renders Sign in on the slim header when signed out', async () => {
    fanTokenState.value = null

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/room/room-test-1']}>
          <RoomChromeProvider>
            <Routes>
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
          </RoomChromeProvider>
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-navigation-slim__sign-in')).not.toBeNull()
    })

    expect(container.querySelector('.riffsync-navigation-slim__sign-in')?.textContent).toBe('Sign in')
    expect(container.querySelector('.riffsync-navigation-slim__profile-trigger')).toBeNull()
  })

  async function renderHostRoom() {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/room/room-test-1']}>
          <RoomChromeProvider>
            <Routes>
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
          </RoomChromeProvider>
        </MemoryRouter>,
      )
    })
    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-host-theater-bar')).not.toBeNull()
    })
  }

  it('opens Watch Party Settings from Settings and saves party name with a status toast', async () => {
    await renderHostRoom()

    const settings = container.querySelector('[aria-label="Settings"]') as HTMLButtonElement
    act(() => settings.click())

    const nameInput = container.querySelector('#riffsync-watch-party-settings-title')
      ?.closest('[role="dialog"]')
      ?.querySelector('input:not([readonly])') as HTMLInputElement
    expect(nameInput).toBeTruthy()

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(nameInput, 'Saved Party')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Save')!
    act(() => save.click())

    await vi.waitFor(() => {
      expect(patchRoom).toHaveBeenCalledWith(
        expect.any(String),
        'room-test-1',
        { displayTitle: 'Saved Party' },
      )
    })
    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-watch-party-settings-status[role="status"]')?.textContent).toBe(
        'Party name saved.',
      )
    })
  })

  it('patches visibility and shows a status toast on success', async () => {
    patchRoom.mockResolvedValueOnce({
      roomId: 'room-test-1',
      version: 3,
      visibility: 'private',
      displayTitle: 'Party',
      catalogEpisodeId: 'ep-1',
      youtubeVideoId: 'yt-1',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
    })
    await renderHostRoom()

    act(() => (container.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click())
    const privateOption = [...container.querySelectorAll('button[role="radio"]')].find(
      (button) => button.textContent === 'Private',
    ) as HTMLButtonElement
    act(() => privateOption.click())

    await vi.waitFor(() => {
      expect(patchRoom).toHaveBeenCalledWith(expect.any(String), 'room-test-1', { visibility: 'private' })
    })
    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-watch-party-settings-status[role="status"]')?.textContent).toContain(
        'Live Now',
      )
    })
  })

  it('does not toast or keep optimistic visibility on failed PATCH', async () => {
    patchRoom.mockRejectedValueOnce(new Error('403 forbidden'))
    await renderHostRoom()

    act(() => (container.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click())
    const privateOption = [...container.querySelectorAll('button[role="radio"]')].find(
      (button) => button.textContent === 'Private',
    ) as HTMLButtonElement
    act(() => privateOption.click())

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('403')
    })
    expect(container.querySelector('.riffsync-watch-party-settings-status')).toBeNull()
    const publicOption = container.querySelector('button[role="radio"][aria-checked="true"]')
    expect(publicOption?.textContent).toBe('Public')
  })

  it('does not PATCH or toast for empty party name', async () => {
    await renderHostRoom()
    act(() => (container.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click())

    const nameInput = container
      .querySelector('[role="dialog"]')
      ?.querySelector('input:not([readonly])') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      setter.call(nameInput, '   ')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      ;[...container.querySelectorAll('button')].find((button) => button.textContent === 'Save')?.click()
    })

    expect(patchRoom).not.toHaveBeenCalled()
    expect(container.querySelector('.riffsync-watch-party-settings-status')).toBeNull()
  })

  it('does not PATCH visibility when re-selecting the current option', async () => {
    await renderHostRoom()
    act(() => (container.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click())
    const publicOption = [...container.querySelectorAll('button[role="radio"]')].find(
      (button) => button.textContent === 'Public',
    ) as HTMLButtonElement
    act(() => publicOption.click())
    expect(patchRoom).not.toHaveBeenCalled()
    expect(container.querySelector('.riffsync-watch-party-settings-status')).toBeNull()
  })

  it('copies the constructed party URL without query or hash', async () => {
    await renderHostRoom()
    act(() => (container.querySelector('[aria-label="Settings"]') as HTMLButtonElement).click())
    act(() => {
      ;[...container.querySelectorAll('button')].find((button) => button.textContent === 'Copy')?.click()
    })
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://www.test.example/room/room-test-1',
      )
    })
  })

  it('does not render Settings for guest JWT or signed-out viewers', async () => {
    fanTokenState.value = mockFanJwt('guest-sub')
    fetchRoom.mockResolvedValueOnce({
      roomId: 'room-test-1',
      hostSub: 'host-sub',
      catalogEpisodeId: 'ep-1',
      youtubeVideoId: 'yt-1',
      version: 1,
      visibility: 'public',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      roomMode: 'theater',
      avDisabled: false,
      broadcastCaptureActive: false,
      displayTitle: 'Party',
    })
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/room/room-test-1']}>
          <RoomChromeProvider>
            <Routes>
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
          </RoomChromeProvider>
        </MemoryRouter>,
      )
    })
    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-navigation-slim')).not.toBeNull()
    })
    expect(container.querySelector('[aria-label="Settings"]')).toBeNull()
    expect(container.querySelector('.riffsync-host-theater-bar')).toBeNull()
    expect(patchRoom).not.toHaveBeenCalled()

    fanTokenState.value = null
    fetchRoom.mockResolvedValueOnce({
      roomId: 'room-test-1',
      hostSub: 'host-sub',
      catalogEpisodeId: 'ep-1',
      youtubeVideoId: 'yt-1',
      version: 1,
      visibility: 'public',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
      roomMode: 'theater',
      avDisabled: false,
      broadcastCaptureActive: false,
      displayTitle: 'Party',
    })
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/room/room-test-1']}>
          <RoomChromeProvider>
            <Routes>
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
          </RoomChromeProvider>
        </MemoryRouter>,
      )
    })
    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-navigation-slim')).not.toBeNull()
    })
    expect(container.querySelector('[aria-label="Settings"]')).toBeNull()
    expect(container.querySelector('.riffsync-host-theater-bar')).toBeNull()
  })

  function sidebarChatColumn() {
    return container.querySelector('.riffsync-room-page__chat')
  }

  it('party rail has no Room tab, host console, or sidebar Leave Party (#473)', async () => {
    await renderHostRoom()

    expect(container.querySelector('.riffsync-room-page__aux-tabs')).toBeNull()
    expect(
      [...container.querySelectorAll('.riffsync-room-page__tab')].some((tab) => tab.textContent?.trim() === 'Room'),
    ).toBe(false)
    const column = sidebarChatColumn()
    expect(column?.textContent).not.toContain('Leave Party')
    expect(column?.textContent).not.toContain('Next Up')
    expect(column?.textContent).not.toContain('Install Host Extension')
  })

  it('hides the host theater bar in expanded view', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 992px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/room/room-test-1']}>
          <RoomChromeProvider>
            <Routes>
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
          </RoomChromeProvider>
        </MemoryRouter>,
      )
    })

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-host-theater-bar')).not.toBeNull()
    })

    const expand = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Expand view',
    )
    expect(expand).toBeTruthy()
    act(() => {
      expand?.click()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-room-page__theater--expanded')).not.toBeNull()
    })
    expect(container.querySelector('.riffsync-host-theater-bar')).toBeNull()
    expect(container.querySelector('.riffsync-navigation-slim')).not.toBeNull()
    expect(container.querySelector('.riffsync-room-page__chat--overlay')).not.toBeNull()
    expect(container.querySelector('.riffsync-room-page__aux-tabs')).toBeNull()
    expect(
      [...container.querySelectorAll('button')].some((button) => button.textContent === 'Exit expanded view'),
    ).toBe(true)
    const overlay = container.querySelector('.riffsync-room-page__chat--overlay')
    expect(overlay?.textContent).not.toContain('Leave Party')
    expect(overlay?.textContent).not.toContain('Next Up')
  })
})
