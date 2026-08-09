// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomPage } from './RoomPage'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import {
  CAST_ACTIVE_HEADING,
  CAST_ACTIVE_SUBCOPY,
  CAST_STOP_FAILED_SUBCOPY,
  CAST_STOP_BUTTON_LABEL,
} from '../room/cast/castActiveStatusCopy'
import type { CastStartLifecycle } from '../room/cast/castChannelProtocol'

const fetchRoom = vi.fn()
const fetchRtcIceServers = vi.fn()
const castStartLifecycle = vi.hoisted(() => ({ value: 'idle' as CastStartLifecycle }))
const startCast = vi.hoisted(() => vi.fn())
const stopCast = vi.hoisted(() => vi.fn())
const castToTvButtonRef = vi.hoisted(() => ({ current: null as HTMLButtonElement | null }))
const stopCastButtonRef = vi.hoisted(() => ({ current: null as HTMLButtonElement | null }))

vi.mock('../room/experimentalRoomFeatures', () => ({
  detectExperimentalRoomFeatures: () => true,
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
  useCastAvailability: () => 'available',
}))

vi.mock('../room/cast/useCastStartSession', () => ({
  useCastStartSession: () => ({
    castStartLifecycle: castStartLifecycle.value,
    startCast,
    stopCast,
    castToTvButtonRef,
    stopCastButtonRef,
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
      unpublishProducerKind: vi.fn(),
      unpublishProducerClass: vi.fn(),
    }),
    resolveSfuWsBaseForToken: vi.fn(() => 'wss://sfu.test.example'),
  }
})

vi.mock('../api/webrtcSfuApi', () => ({
  fetchSfuJoinToken: vi.fn().mockResolvedValue({
    token: 'sfu-jwt',
    wsUrl: 'wss://sfu.test.example',
    role: 'consumer',
    expiresInSeconds: 900,
  }),
}))

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING

  constructor(url: string) {
    void url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
    })
  }

  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {
    this.readyState = MockWebSocket.CLOSED
  }
}

describe('RoomPage Cast active stage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    castStartLifecycle.value = 'idle'
    startCast.mockReset()
    stopCast.mockReset()
    castToTvButtonRef.current = null
    stopCastButtonRef.current = null
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)

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

  async function openRoomTab() {
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
      expect(container.querySelector('.riffsync-room-page__tab')).not.toBeNull()
    })

    const roomTab = Array.from(container.querySelectorAll('.riffsync-room-page__tab')).find(
      (node) => node.textContent?.trim() === 'Room',
    )
    act(() => {
      ;(roomTab as HTMLButtonElement).click()
    })
  }

  it('replaces the playback surface with Now Casting while casting', async () => {
    castStartLifecycle.value = 'casting'
    await openRoomTab()

    expect(container.querySelector('[data-testid="cast-active-stage-panel"]')).not.toBeNull()
    expect(container.textContent).toContain(CAST_ACTIVE_HEADING)
    expect(container.textContent).toContain(CAST_ACTIVE_SUBCOPY)
    expect(container.textContent).toContain(CAST_STOP_BUTTON_LABEL)
    expect(container.querySelector('.riffsync-room-page__playback')).toBeNull()
    expect(container.querySelector('.riffsync-room-page__guest-video')).toBeNull()
  })

  it('keeps the regular playback surface visible while Cast is starting', async () => {
    castStartLifecycle.value = 'launching'
    await openRoomTab()

    expect(container.querySelector('[data-testid="cast-active-stage-panel"]')).toBeNull()
    expect(container.querySelector('.riffsync-room-page__playback')).not.toBeNull()
  })

  it('hides expanded view controls while casting', async () => {
    castStartLifecycle.value = 'casting'
    await openRoomTab()

    expect(container.querySelector('.riffsync-room-page__expand-toggle')).toBeNull()
  })

  it('invokes stopCast when Stop Cast is clicked', async () => {
    castStartLifecycle.value = 'casting'
    await openRoomTab()

    const stopButton = container.querySelector('.riffsync-room-page__cast-stop-button') as HTMLButtonElement
    act(() => {
      stopButton.click()
    })

    expect(stopCast).toHaveBeenCalledTimes(1)
  })

  it('shows Stop Cast on the A/V bar while casting', async () => {
    castStartLifecycle.value = 'casting'
    await openRoomTab()

    expect(container.querySelector('[data-testid="room-av-cast-button"]')?.getAttribute('aria-label')).toBe(
      'Stop Cast',
    )
  })

  it('keeps Stop Cast retryable while stop failure is local and active', async () => {
    castStartLifecycle.value = 'stop_failed'
    await openRoomTab()

    expect(container.querySelector('[data-testid="cast-active-stage-panel"]')).not.toBeNull()
    expect(container.textContent).toContain(CAST_STOP_FAILED_SUBCOPY)
    expect(container.querySelector('.riffsync-room-page__playback')).toBeNull()

    const stopButton = container.querySelector('.riffsync-room-page__cast-stop-button') as HTMLButtonElement
    expect(stopButton.disabled).toBe(false)

    act(() => {
      stopButton.click()
    })

    expect(stopCast).toHaveBeenCalledTimes(1)
  })
})
