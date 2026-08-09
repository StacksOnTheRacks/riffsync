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
import {
  CAST_ACTIVE_HEADING,
  RIFFSYNC_CAST_ACTIVE_STATUS_ID,
} from '../room/cast/castActiveStatusCopy'
import type { CastStartLifecycle } from '../room/cast/castChannelProtocol'
import type { RoomRealtimeDiagnostics } from '../room/sessions/RoomRealtimeSdk'

const fetchRoom = vi.fn()
const fetchRtcIceServers = vi.fn()
const fetchFanProfile = vi.fn()
const patchRoom = vi.fn()
const fetchSfuJoinToken = vi.fn()
const castStartLifecycle = vi.hoisted(() => ({ value: 'idle' as CastStartLifecycle }))
const stopCast = vi.hoisted(() => vi.fn())

vi.mock('../room/experimentalRoomFeatures', () => ({
  detectExperimentalRoomFeatures: () => false,
}))

vi.mock('../api/roomsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/roomsApi')>()
  return {
    ...actual,
    fetchRoom: (...args: unknown[]) => fetchRoom(...args),
    patchRoom: (...args: unknown[]) => patchRoom(...args),
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
  useCatalogListQuery: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
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
  fetchSfuJoinToken: (...args: unknown[]) => fetchSfuJoinToken(...args),
}))

const sendControlSpy = vi.hoisted(() => vi.fn(() => true))

const defaultDrawerDiagnostics = vi.hoisted(
  () =>
    ({
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
    }) satisfies RoomRealtimeDiagnostics,
)

const drawerStatusMockConfig = vi.hoisted(() => {
  type MockConfig = {
    diagnostics: RoomRealtimeDiagnostics
    guestShareFsm: 'idle' | 'verifying_media' | 'running'
  }

  let config: MockConfig = {
    diagnostics: defaultDrawerDiagnostics,
    guestShareFsm: 'running',
  }

  class MockRoomRealtimeSdk {
    sendControl = sendControlSpy

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
  sent: string[] = []

  constructor(url: string) {
    void url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
    })
  }

  addEventListener() {}
  removeEventListener() {}
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = MockWebSocket.CLOSED
  }
}

const CAST_LIFECYCLE_PATHS: CastStartLifecycle[] = [
  'idle',
  'launching',
  'session_pending_render',
  'casting',
  'stopping',
  'start_failed',
  'session_ended',
  'playback_blocked',
  'stop_failed',
]

describe('RoomPage Cast room authority (#305)', () => {
  let container: HTMLDivElement
  let root: Root
  let chatDisconnectSpy: ReturnType<typeof vi.spyOn>
  let sfuDisconnectSpy: ReturnType<typeof vi.spyOn>
  let theaterDisposeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    castStartLifecycle.value = 'idle'
    fanTokenState.value = null
    stopCast.mockReset()
    patchRoom.mockReset()
    sendControlSpy.mockClear()
    drawerStatusMockConfig.set({
      diagnostics: defaultDrawerDiagnostics,
      guestShareFsm: 'running',
    })
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)

    chatDisconnectSpy = vi.spyOn(ChatSession.prototype, 'disconnect')
    sfuDisconnectSpy = vi.spyOn(SfuMediaSession.prototype, 'disconnect')
    theaterDisposeSpy = vi.spyOn(TheaterPlayback.prototype, 'dispose')

    fetchRtcIceServers.mockResolvedValue([{ urls: 'stun:stun.test' }])
    fetchFanProfile.mockResolvedValue({ displayName: 'Fan One', avatarUrl: null })
    fetchSfuJoinToken.mockResolvedValue({
      token: 'sfu-jwt',
      wsUrl: 'wss://sfu.test.example',
      role: 'consumer',
      expiresInSeconds: 900,
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

  async function rerenderCastLifecycle(lifecycle: CastStartLifecycle) {
    castStartLifecycle.value = lifecycle
    renderRoom()
    await waitForSidebarTabs()
  }

  function roomWsMessages(): string[] {
    return MockWebSocket.instances.flatMap((socket) => socket.sent)
  }

  it.each(CAST_LIFECYCLE_PATHS)(
    'does not call patchRoom or sendControl when Cast lifecycle is %s',
    async (lifecycle) => {
      castStartLifecycle.value = lifecycle
      renderRoom()
      await waitForSidebarTabs()

      expect(patchRoom).not.toHaveBeenCalled()
      expect(sendControlSpy).not.toHaveBeenCalled()
    },
  )

  it('does not issue extra SFU token requests across Cast lifecycle re-renders', async () => {
    renderRoom()
    await waitForSidebarTabs()

    const tokenCallsBefore = fetchSfuJoinToken.mock.calls.length

    for (const lifecycle of CAST_LIFECYCLE_PATHS) {
      await rerenderCastLifecycle(lifecycle)
    }

    expect(fetchSfuJoinToken.mock.calls.length).toBe(tokenCallsBefore)
  })

  it('does not emit room WebSocket traffic when Cast lifecycle changes', async () => {
    renderRoom()
    await waitForSidebarTabs()

    const messagesBefore = roomWsMessages().length

    for (const lifecycle of CAST_LIFECYCLE_PATHS) {
      await rerenderCastLifecycle(lifecycle)
    }

    expect(roomWsMessages().length).toBe(messagesBefore)
  })

  it('does not disconnect chat or SFU sessions across Cast lifecycle re-renders', async () => {
    renderRoom()
    await waitForSidebarTabs()

    const chatBefore = chatDisconnectSpy.mock.calls.length
    const sfuBefore = sfuDisconnectSpy.mock.calls.length

    for (const lifecycle of CAST_LIFECYCLE_PATHS) {
      await rerenderCastLifecycle(lifecycle)
    }

    expect(chatDisconnectSpy.mock.calls.length).toBe(chatBefore)
    expect(sfuDisconnectSpy.mock.calls.length).toBe(sfuBefore)
  })

  it('keeps drawer diagnostics unchanged when Cast becomes active on the sender', async () => {
    renderRoom()
    await waitForSidebarTabs()

    const diagnosticsBefore = drawerStatusMockConfig.get().diagnostics

    await rerenderCastLifecycle('casting')

    expect(drawerStatusMockConfig.get().diagnostics).toEqual(diagnosticsBefore)
    expect(container.querySelector(`#${RIFFSYNC_CAST_ACTIVE_STATUS_ID}`)).not.toBeNull()
  })

  it('remote participant view stays Cast-free when local Cast lifecycle is idle', async () => {
    castStartLifecycle.value = 'idle'
    renderRoom()
    await waitForSidebarTabs()

    expect(container.querySelector('[data-testid="cast-active-stage-panel"]')).toBeNull()
    expect(container.textContent).not.toContain(CAST_ACTIVE_HEADING)
    expect(container.querySelector('.riffsync-room-page__playback')).not.toBeNull()
  })

  it('does not dispose TheaterPlayback across Cast lifecycle re-renders', async () => {
    renderRoom()
    await waitForSidebarTabs()

    const disposeBefore = theaterDisposeSpy.mock.calls.length

    for (const lifecycle of CAST_LIFECYCLE_PATHS) {
      await rerenderCastLifecycle(lifecycle)
    }

    expect(theaterDisposeSpy.mock.calls.length).toBe(disposeBefore)
  })

  it('keeps activeErrorCodes empty across Cast lifecycle re-renders', async () => {
    renderRoom()
    await waitForSidebarTabs()

    for (const lifecycle of CAST_LIFECYCLE_PATHS) {
      await rerenderCastLifecycle(lifecycle)
    }

    expect(drawerStatusMockConfig.get().diagnostics.activeErrorCodes).toEqual([])
  })

  it('does not show Now Casting stage while session_pending_render', async () => {
    await rerenderCastLifecycle('session_pending_render')

    expect(container.querySelector('[data-testid="cast-active-stage-panel"]')).toBeNull()
    expect(container.textContent).not.toContain(CAST_ACTIVE_HEADING)
    expect(container.querySelector('.riffsync-room-page__playback')).not.toBeNull()
  })

  it('invokes local stopCast without room mutation or websocket fan-out', async () => {
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    const patchBefore = patchRoom.mock.calls.length
    const messagesBefore = roomWsMessages().length
    const chatBefore = chatDisconnectSpy.mock.calls.length
    const sfuBefore = sfuDisconnectSpy.mock.calls.length

    const stopButton = container.querySelector('.riffsync-room-page__cast-stop-button') as HTMLButtonElement
    act(() => {
      stopButton.click()
    })

    expect(stopCast).toHaveBeenCalledTimes(1)
    expect(patchRoom.mock.calls.length).toBe(patchBefore)
    expect(roomWsMessages().length).toBe(messagesBefore)
    expect(chatDisconnectSpy.mock.calls.length).toBe(chatBefore)
    expect(sfuDisconnectSpy.mock.calls.length).toBe(sfuBefore)
  })

  it('allows repeated Stop Cast clicks without room mutation side effects', async () => {
    castStartLifecycle.value = 'casting'
    renderRoom()
    await waitForSidebarTabs()

    const patchBefore = patchRoom.mock.calls.length
    const messagesBefore = roomWsMessages().length

    const stopButton = container.querySelector('.riffsync-room-page__cast-stop-button') as HTMLButtonElement
    act(() => {
      stopButton.click()
      stopButton.click()
    })

    expect(stopCast).toHaveBeenCalledTimes(2)
    expect(patchRoom.mock.calls.length).toBe(patchBefore)
    expect(roomWsMessages().length).toBe(messagesBefore)
  })
})
