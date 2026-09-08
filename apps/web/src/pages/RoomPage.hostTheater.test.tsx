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
const fetchRtcIceServers = vi.fn()
const fanTokenState = vi.hoisted(() => ({ value: mockFanJwt('host-sub') }))

vi.mock('../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/roomsApi')>()
  return {
    ...actual,
    fetchRoom: (...args: unknown[]) => fetchRoom(...args),
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
    fetchRtcIceServers.mockResolvedValue([{ urls: 'stun:stun.test' }])
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
  })
})
