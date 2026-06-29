// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomPage } from './RoomPage'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import { ChatSession } from '../room/sessions/ChatSession'
import { SfuMediaSession } from '../room/sessions/SfuMediaSession'
import {
  CAST_ACTIVE_HEADING,
  CAST_STOP_BUTTON_LABEL,
  RIFFSYNC_CAST_ACTIVE_STATUS_ID,
} from '../room/cast/castActiveStatusCopy'
import type { CastStartLifecycle } from '../room/cast/castChannelProtocol'
import {
  CHAT_RECONNECTING_COPY,
  drawerDiagnostics,
} from './roomPageDrawerStatusTestHelpers'
import {
  RIFFSYNC_CHAT_COMPOSE_STATUS_ID,
  RIFFSYNC_CHAT_DRAWER_STATUS_ID,
  RIFFSYNC_VIDEO_RELAY_STATUS_ID,
} from '../room/drawerErrorPresentation'
import type { RoomRealtimeDiagnostics } from '../room/sessions/RoomRealtimeSdk'
import { acquireRoomMediaEngine } from '../room/engine/RoomMediaEngine'

vi.mock('../room/experimentalRoomFeatures', () => ({
  detectExperimentalRoomFeatures: () => experimentalEnabled.value,
}))

const fetchRoom = vi.fn()
const fetchRtcIceServers = vi.fn()
const fetchFanProfile = vi.fn()
const castStartLifecycle = vi.hoisted(() => ({ value: 'idle' as CastStartLifecycle }))
const stopCast = vi.hoisted(() => vi.fn())
const experimentalEnabled = vi.hoisted(() => ({ value: false }))

function mockFanJwt(sub = 'fan-sub-1'): string {
  const payload = btoa(JSON.stringify({ sub }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`
}

vi.mock('../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/roomsApi')>()
  return {
    ...actual,
    fetchRoom: (...args: unknown[]) => fetchRoom(...args),
  }
})

vi.mock('../api/fanProfileApi', () => ({
  fetchFanProfile: (...args: unknown[]) => fetchFanProfile(...args),
}))

vi.mock('../config/fetchRtcIceServers', () => ({
  fetchRtcIceServers: () => fetchRtcIceServers(),
}))

vi.mock('../catalog/catalogQueries', () => ({
  useCatalogEpisodeQuery: () => ({ data: undefined }),
}))

const fanTokenState = vi.hoisted(() => ({ value: null as string | null }))

vi.mock('../auth/fanTokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/fanTokens')>()
  return {
    ...actual,
    getFanAccessToken: () => fanTokenState.value,
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
    startCast: vi.fn(),
    stopCast,
    castToTvButtonRef: { current: null },
    stopCastButtonRef: { current: null },
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

const drawerStatusMockConfig = vi.hoisted(() => {
  type MockConfig = {
    diagnostics: RoomRealtimeDiagnostics
    guestShareFsm: 'idle' | 'verifying_media' | 'running'
  }

  let config: MockConfig = {
    diagnostics: {
      roomId: 'room-test-1',
      sessionId: 'sess-test-1',
      asOf: new Date(0).toISOString(),
      drawers: {
        chat: { state: 'connected' },
        sfuSignaling: {
          state: 'connected',
          health: {
            connectivity: { state: 'connected' },
            produceConsume: {
              state: 'connected',
              producerCount: 0,
              consumerCount: 0,
              hostScreenAttached: false,
              participantAvPublishActive: false,
            },
          },
        },
        theaterPlayback: { state: 'connected' },
      },
      activeErrorCodes: [],
    },
    guestShareFsm: 'running',
  }

  class MockRoomRealtimeSdk {
    join(_roomId: string, options: { onDiagnosticsChange?: (diagnostics: MockConfig['diagnostics']) => void }) {
      options.onDiagnosticsChange?.(config.diagnostics)
    }

    subscribe() {}

    teardown() {}

    onTheaterSnapshotChange(listener: (snapshot: {
      guestShareFsm: MockConfig['guestShareFsm']
      guestPlayHint: boolean
      hostCapturePlayHint: boolean
    }) => void) {
      listener({
        guestShareFsm: config.guestShareFsm,
        guestPlayHint: false,
        hostCapturePlayHint: false,
      })
      return () => undefined
    }

    getTheaterSnapshot() {
      return {
        guestShareFsm: config.guestShareFsm,
        guestPlayHint: false,
        hostCapturePlayHint: false,
      }
    }

    getDiagnostics() {
      return config.diagnostics
    }

    getChatStatus() {
      return 'open' as const
    }

    getParticipantAvController() {
      return null
    }

    buildParticipantProducerSnapshots() {
      return new Map()
    }

    onParticipantProducerRegistryChange() {
      return () => undefined
    }

    sendControl() {
      return true
    }

    setCaptureStreamForTheater() {}
    setYoutubeVideoIdForTheater() {}
    setRoomMode() {}
    setAvDisabled() {}
    updateFanToken() {}
    getSfuStatus() {
      return 'open' as const
    }
    syncHostScreenPublish() {
      return () => undefined
    }
    unpublishHostScreen() {}
    playGuestVideo() {
      return Promise.resolve()
    }
    playHostCapturePreview() {
      return Promise.resolve()
    }
    bindGuestVideo() {}
    bindHostCaptureVideo() {}
    notifyComposeDraftChange() {}
  }

  return {
    get: () => config,
    set: (next: MockConfig) => {
      config = next
    },
    MockRoomRealtimeSdk,
  }
})

vi.mock('../room/sessions/RoomRealtimeSdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../room/sessions/RoomRealtimeSdk')>()
  return {
    ...actual,
    RoomRealtimeSdk: drawerStatusMockConfig.MockRoomRealtimeSdk,
  }
})

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

describe('RoomPage Cast active participation (#275)', () => {
  let container: HTMLDivElement
  let root: Root
  let chatDisconnectSpy: ReturnType<typeof vi.spyOn>
  let sfuDisconnectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    castStartLifecycle.value = 'idle'
    fanTokenState.value = null
    experimentalEnabled.value = false
    stopCast.mockReset()
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({ chat: { state: 'connected' } }),
      guestShareFsm: 'running',
    })
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)

    chatDisconnectSpy = vi.spyOn(ChatSession.prototype, 'disconnect')
    sfuDisconnectSpy = vi.spyOn(SfuMediaSession.prototype, 'disconnect')

    fetchRtcIceServers.mockResolvedValue([{ urls: 'stun:stun.test' }])
    fetchFanProfile.mockResolvedValue({ displayName: 'Fan One', avatarUrl: null })
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

  function renderRoom(initialPath = '/room/room-test-1') {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <RoomChromeProvider>
            <Routes>
              <Route path="/room/:roomId" element={<RoomPage />} />
            </Routes>
          </RoomChromeProvider>
        </MemoryRouter>,
      )
    })
  }

  async function waitForSidebarTabs() {
    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-room-page__tab')).not.toBeNull()
    })
  }

  function tabButton(label: string | RegExp) {
    return Array.from(container.querySelectorAll('.riffsync-room-page__tab')).find((node) =>
      typeof label === 'string' ? node.textContent?.trim() === label : label.test(node.textContent ?? ''),
    ) as HTMLButtonElement | undefined
  }

  function composeInput() {
    return container.querySelector('input[placeholder="Say something…"]') as HTMLInputElement | null
  }

  function sendButton() {
    return container.querySelector('.riffsync-room-chat-compose-send') as HTMLButtonElement | null
  }

  async function rerenderCastLifecycle(lifecycle: CastStartLifecycle) {
    castStartLifecycle.value = lifecycle
    renderRoom()
    await waitForSidebarTabs()
  }

  it('keeps sidebar tabs and compose interactive while Cast is active', async () => {
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    expect(container.querySelector('[data-testid="cast-active-stage-panel"]')).not.toBeNull()
    expect(container.textContent).toContain(CAST_ACTIVE_HEADING)

    const peopleTab = tabButton(/^People/)
    act(() => {
      peopleTab?.click()
    })
    expect(tabButton('Chat')?.className).not.toContain('riffsync-room-page__tab--on')

    act(() => {
      tabButton('Chat')?.click()
    })
    expect(composeInput()).not.toBeNull()
    expect(composeInput()?.disabled).toBe(true)
  })

  it('retains compose draft across sidebar tab switches while Cast is active', async () => {
    fanTokenState.value = mockFanJwt()
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    act(() => {
      acquireRoomMediaEngine('room-test-1').setChatDraft('draft while casting')
    })
    await vi.waitFor(() => {
      expect(composeInput()?.value).toBe('draft while casting')
    })

    act(() => {
      tabButton(/^People/)?.click()
    })
    act(() => {
      tabButton('Chat')?.click()
    })

    expect(composeInput()?.value).toBe('draft while casting')
  })

  it('does not disconnect chat or SFU sessions across Cast lifecycle re-renders', async () => {
    renderRoom()
    await waitForSidebarTabs()

    const chatBefore = chatDisconnectSpy.mock.calls.length
    const sfuBefore = sfuDisconnectSpy.mock.calls.length

    await rerenderCastLifecycle('casting')
    await rerenderCastLifecycle('idle')

    expect(chatDisconnectSpy.mock.calls.length).toBe(chatBefore)
    expect(sfuDisconnectSpy.mock.calls.length).toBe(sfuBefore)
  })

  it('shows chat-only reconnect banner while Cast is active without surfacing Cast in chat drawer', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'reconnecting' },
        sfuSignaling: { state: 'connected' },
      }),
      guestShareFsm: 'running',
    })
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    const chatBanner = container.querySelector(`#${RIFFSYNC_CHAT_DRAWER_STATUS_ID}`)
    expect(chatBanner?.textContent).toBe(CHAT_RECONNECTING_COPY)
    expect(chatBanner?.textContent).not.toContain(CAST_ACTIVE_HEADING)
    expect(container.querySelector(`#${RIFFSYNC_CAST_ACTIVE_STATUS_ID}`)).not.toBeNull()
    expect(container.querySelector(`#${RIFFSYNC_VIDEO_RELAY_STATUS_ID}`)).toBeNull()
  })

  it('keeps compose enabled during SFU-only reconnect while Cast is active', async () => {
    fanTokenState.value = mockFanJwt()
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'connected' },
        sfuSignaling: { state: 'reconnecting' },
      }),
      guestShareFsm: 'running',
    })
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    expect(sendButton()?.disabled).toBe(false)
    expect(container.querySelector(`#${RIFFSYNC_CHAT_COMPOSE_STATUS_ID}`)).toBeNull()
    expect(container.querySelector(`#${RIFFSYNC_CHAT_DRAWER_STATUS_ID}`)).toBeNull()
  })

  it('keeps anonymous chat read-only while Cast is active', async () => {
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    expect(container.querySelector('.riffsync-room-chat-signin-overlay')).not.toBeNull()
    expect(sendButton()?.disabled).toBe(true)
  })

  it('keeps signed-in compose enabled while Cast is active', async () => {
    fanTokenState.value = mockFanJwt()
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    expect(container.querySelector('.riffsync-room-chat-signin-overlay')).toBeNull()
    expect(sendButton()?.disabled).toBe(false)
  })

  it('renders participant A/V toggles under fan + experimental flags while Cast is active', async () => {
    fanTokenState.value = mockFanJwt()
    experimentalEnabled.value = true
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    expect(container.querySelector('.riffsync-room-av-toggle')).not.toBeNull()
    expect(container.textContent).toContain('Camera')
    expect(container.textContent).toContain('Microphone')
  })

  it('invokes local stopCast without tearing down room sessions', async () => {
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    const chatBefore = chatDisconnectSpy.mock.calls.length
    const sfuBefore = sfuDisconnectSpy.mock.calls.length

    const stopButton = container.querySelector('.riffsync-room-page__cast-stop-button') as HTMLButtonElement
    act(() => {
      stopButton.click()
    })

    expect(stopCast).toHaveBeenCalledTimes(1)
    expect(chatDisconnectSpy.mock.calls.length).toBe(chatBefore)
    expect(sfuDisconnectSpy.mock.calls.length).toBe(sfuBefore)
    expect(container.textContent).toContain(CAST_STOP_BUTTON_LABEL)
  })
})
