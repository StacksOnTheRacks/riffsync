// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomPage } from './RoomPage'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import {
  CAST_UNAVAILABLE_MESSAGE,
  RIFFSYNC_CAST_AVAILABILITY_STATUS_ID,
} from '../room/cast/castAvailabilityTypes'
import type { CastAvailabilityState } from '../room/cast/castAvailabilityTypes'

const fetchRoom = vi.fn()
const fetchRtcIceServers = vi.fn()
const castAvailabilityState = vi.hoisted(() => ({
  value: 'checking' as CastAvailabilityState,
}))

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
  useCatalogEpisodeQuery: () => ({ data: undefined }),
  useCatalogListQuery: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
}))

vi.mock('../auth/fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/fanTokens')>()
  return {
    ...actual,
    getFanAccessToken: () => null,
  }
})

vi.mock('../config/wsUrl', () => ({
  getPublicWsUrl: () => 'wss://ws.test.example',
}))

vi.mock('../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.test.example',
}))

vi.mock('../config/publicOrigin', () => ({
  getPublicOrigin: () => 'https://www.test.example',
}))

vi.mock('../session/guestSession', () => ({
  ensureGuestSession: () => ({ sessionId: 'sess-test-1', displayName: 'Guest' }),
  setGuestDisplayName: (name: string) => name,
  FAN_DISPLAY_NAME_MAX_LEN: 48,
}))

vi.mock('../room/cast/useCastAvailability', () => ({
  useCastAvailability: () => castAvailabilityState.value,
}))

vi.mock('../room/cast/useCastStartSession', () => ({
  useCastStartSession: () => ({
    castStartLifecycle: 'idle',
    startCast: vi.fn(),
    stopCast: vi.fn(),
    castToTvButtonRef: { current: null },
    stopCastButtonRef: { current: null },
  }),
}))

vi.mock('../room/useLinkTvSession', () => ({
  useLinkTvSession: () => ({
    linkPanelOpen: false,
    openLinkPanel: vi.fn(),
    closeLinkPanel: vi.fn(),
    linkActive: false,
    claimCode: vi.fn(),
    stopLink: vi.fn(),
    tvClientSessionId: null,
  }),
}))

vi.mock('../room/audio/theaterAudioMix', () => ({
  createTheaterAudioMix: vi.fn(() => ({
    dispose: vi.fn(),
    setAvDisabled: vi.fn(),
    setHostVideoElement: vi.fn(),
    onConsumerEvent: vi.fn(),
    resumeIfSuspended: vi.fn().mockResolvedValue(undefined),
    getAudioContextState: vi.fn(() => 'running'),
    watchAudioContextState: vi.fn((listener: (state: AudioContextState | undefined) => void) => {
      listener('running')
      return () => undefined
    }),
  })),
}))

vi.mock('../room/sfu/mediasoupSharing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../room/sfu/mediasoupSharing')>()
  return {
    ...actual,
    connectSfuUnifiedSession: vi.fn().mockResolvedValue({
      close: vi.fn(),
      replaceHostScreenProducer: vi.fn(),
      ready: Promise.resolve(),
      sessionEnded: new Promise(() => undefined),
    }),
  }
})

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  readyState = MockWebSocket.CONNECTING
  url: string
  private listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
      for (const fn of this.listeners.get('open') ?? []) fn({})
    })
  }

  addEventListener(type: string, fn: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set()
    set.add(fn)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.get(type)?.delete(fn)
  }

  send() {}

  close() {
    this.readyState = MockWebSocket.CLOSED
    for (const fn of this.listeners.get('close') ?? []) fn({ code: 1000, reason: '' })
  }
}

describe('RoomPage Cast availability', () => {
  let container: HTMLDivElement
  let root: Root
  let webSocketCtor: ReturnType<typeof vi.fn>

  beforeEach(() => {
    castAvailabilityState.value = 'checking'
    MockWebSocket.instances = []
    webSocketCtor = vi.fn((url: string) => new MockWebSocket(url))
    Object.assign(webSocketCtor, {
      CONNECTING: MockWebSocket.CONNECTING,
      OPEN: MockWebSocket.OPEN,
      CLOSED: MockWebSocket.CLOSED,
    })
    vi.stubGlobal('WebSocket', webSocketCtor)

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
      avDisabled: true,
      broadcastCaptureActive: false,
      playbackHost: 'youtube',
      customPlaybackUrl: null,
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    act(() => root.unmount())
    await new Promise((resolve) => setTimeout(resolve, 50))
    container.remove()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  function renderRoom() {
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
  }

  it('shows Cast and Link TV in the A/V control bar when sender support is available', async () => {
    castAvailabilityState.value = 'available'
    renderRoom()

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="room-av-cast-button"]')).not.toBeNull()
    })
    expect(container.querySelector('[data-testid="room-av-link-tv-button"]')).not.toBeNull()
    expect(container.querySelector(`#${RIFFSYNC_CAST_AVAILABILITY_STATUS_ID}`)).toBeNull()
    expect(container.textContent).not.toContain('Cast to TV')
  })

  it('shows local unavailable copy at the A/V bar when sender support is absent', async () => {
    castAvailabilityState.value = 'unavailable'
    renderRoom()

    await vi.waitFor(() => {
      expect(container.querySelector(`#${RIFFSYNC_CAST_AVAILABILITY_STATUS_ID}`)).not.toBeNull()
    })
    const status = container.querySelector(`#${RIFFSYNC_CAST_AVAILABILITY_STATUS_ID}`)
    expect(status?.textContent).toBe(CAST_UNAVAILABLE_MESSAGE)
    expect(container.querySelector('[data-testid="room-av-link-tv-button"]')).not.toBeNull()
  })

  it('omits Cast start from expanded view overlay (controls stay in sidebar footer when not expanded-only)', async () => {
    castAvailabilityState.value = 'available'
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

    renderRoom()
    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-room-page__expand-toggle')).not.toBeNull()
    })

    act(() => {
      ;(container.querySelector('.riffsync-room-page__expand-toggle') as HTMLButtonElement).click()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[data-expanded-view="true"]')).not.toBeNull()
    })

    // Icon-only Cast control has no "Cast to TV" visible label.
    expect(container.textContent).not.toContain('Cast to TV')
  })

  it('does not surface Cast unavailable copy in chat drawer status', async () => {
    castAvailabilityState.value = 'unavailable'
    renderRoom()

    await vi.waitFor(() => {
      expect(container.textContent).toContain(CAST_UNAVAILABLE_MESSAGE)
    })
    const chatDrawerStatus = container.querySelector('#riffsync-chat-drawer-status')
    expect(chatDrawerStatus?.textContent ?? '').not.toContain(CAST_UNAVAILABLE_MESSAGE)
  })

  it('keeps Cast available without experimental opt-in', async () => {
    castAvailabilityState.value = 'available'
    renderRoom()

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="room-av-cast-button"]')).not.toBeNull()
    })
  })
})
