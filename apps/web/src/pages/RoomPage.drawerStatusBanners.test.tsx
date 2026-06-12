// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomPage } from './RoomPage'
import { RoomChromeProvider } from '../room/RoomChromeProvider'
import {
  CHAT_RECONNECTING_COPY,
  drawerDiagnostics,
  GUEST_IDLE_VIDEO_RELAY_COPY,
  RETIRED_COMBINED_STATUS_COPY,
  VIDEO_RELAY_RECONNECTING_COPY,
} from './roomPageDrawerStatusTestHelpers'
import { RIFFSYNC_CHAT_DRAWER_STATUS_ID, RIFFSYNC_VIDEO_RELAY_STATUS_ID } from '../room/drawerErrorPresentation'

const fetchRoom = vi.fn()
const fetchRtcIceServers = vi.fn()

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
}))

vi.mock('../auth/fanTokens', () => ({
  getFanAccessToken: () => null,
}))

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

const drawerStatusMockConfig = vi.hoisted(() => {
  type MockConfig = {
    diagnostics: {
      roomId: string
      sessionId: string
      asOf: string
      drawers: {
        chat: { state: string; lastErrorCode?: string }
        sfuSignaling: { state: string; lastErrorCode?: string }
        theaterPlayback: { state: string; lastErrorCode?: string }
      }
      activeErrorCodes: string[]
    }
    guestShareFsm: 'idle' | 'verifying_media' | 'running'
  }

  let config: MockConfig = {
    diagnostics: {
      roomId: 'room-test-1',
      sessionId: 'sess-test-1',
      asOf: new Date(0).toISOString(),
      drawers: {
        chat: { state: 'connected' },
        sfuSignaling: { state: 'connected' },
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

    sendControl() {
      return true
    }

    setCaptureStreamForTheater() {}
    setYoutubeVideoIdForTheater() {}
    syncHostScreenPublish() {}
    unpublishHostScreen() {}
    playGuestVideo() {
      return Promise.resolve()
    }
    playHostCapturePreview() {
      return Promise.resolve()
    }
    bindGuestVideo() {}
    bindHostCaptureVideo() {}
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

describe('RoomPage drawer status banner integration (#209)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({ chat: { state: 'connected' } }),
      guestShareFsm: 'running',
    })

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

  function chatBanner() {
    return container.querySelector(`#${RIFFSYNC_CHAT_DRAWER_STATUS_ID}`)
  }

  function videoRelayBanner() {
    return container.querySelector(`#${RIFFSYNC_VIDEO_RELAY_STATUS_ID}`)
  }

  function assertRetiredCombinedCopyAbsent() {
    expect(container.textContent).not.toContain(RETIRED_COMBINED_STATUS_COPY)
  }

  it('chat-only reconnecting: chat banner uses drawerErrorPresentation copy; video-relay omits chat copy', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'reconnecting' },
        sfuSignaling: { state: 'connected' },
      }),
      guestShareFsm: 'running',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(chatBanner()).not.toBeNull()
    })

    expect(chatBanner()?.textContent).toBe(CHAT_RECONNECTING_COPY)
    expect(videoRelayBanner()).toBeNull()
    assertRetiredCombinedCopyAbsent()
  })

  it('chat-only reconnecting: guest idle FSM may show host-screen idle copy without chat text on stage', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'reconnecting' },
        sfuSignaling: { state: 'connected' },
      }),
      guestShareFsm: 'idle',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(chatBanner()?.textContent).toBe(CHAT_RECONNECTING_COPY)
    })

    expect(videoRelayBanner()?.textContent).toBe(GUEST_IDLE_VIDEO_RELAY_COPY)
    expect(videoRelayBanner()?.textContent).not.toBe(CHAT_RECONNECTING_COPY)
    assertRetiredCombinedCopyAbsent()
  })

  it('SFU-only reconnecting: video-relay banner uses drawerErrorPresentation copy; chat banner absent when chat connected', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'connected' },
        sfuSignaling: { state: 'reconnecting' },
      }),
      guestShareFsm: 'running',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(videoRelayBanner()?.textContent).toBe(VIDEO_RELAY_RECONNECTING_COPY)
    })

    expect(chatBanner()).toBeNull()
    assertRetiredCombinedCopyAbsent()
  })

  it('dual-outage: chat and video-relay banners render simultaneously with independent copy', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'reconnecting' },
        sfuSignaling: { state: 'reconnecting' },
      }),
      guestShareFsm: 'running',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(chatBanner()?.textContent).toBe(CHAT_RECONNECTING_COPY)
      expect(videoRelayBanner()?.textContent).toBe(VIDEO_RELAY_RECONNECTING_COPY)
    })

    assertRetiredCombinedCopyAbsent()
  })

  it('mounts stable drawer status ids when respective banners render', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'reconnecting' },
        sfuSignaling: { state: 'reconnecting' },
      }),
      guestShareFsm: 'running',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(chatBanner()).not.toBeNull()
      expect(videoRelayBanner()).not.toBeNull()
    })

    expect(chatBanner()?.id).toBe(RIFFSYNC_CHAT_DRAWER_STATUS_ID)
    expect(videoRelayBanner()?.id).toBe(RIFFSYNC_VIDEO_RELAY_STATUS_ID)
  })

  it('guest running FSM with healthy SFU omits #riffsync-video-relay-status (#210)', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'connected' },
        sfuSignaling: { state: 'connected' },
      }),
      guestShareFsm: 'running',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(container.querySelector('.riffsync-room-page__playback')).not.toBeNull()
    })

    expect(videoRelayBanner()).toBeNull()
  })

  it('guest idle FSM mounts #riffsync-video-relay-status with role="status" (#210)', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'connected' },
        sfuSignaling: { state: 'connected' },
      }),
      guestShareFsm: 'idle',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(videoRelayBanner()).not.toBeNull()
    })

    expect(videoRelayBanner()?.id).toBe(RIFFSYNC_VIDEO_RELAY_STATUS_ID)
    expect(videoRelayBanner()?.getAttribute('role')).toBe('status')
    expect(videoRelayBanner()?.textContent).toBe(GUEST_IDLE_VIDEO_RELAY_COPY)
  })

  it('config-class SFU error copy renders on #riffsync-video-relay-status (#210)', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics(
        {
          chat: { state: 'connected' },
          sfuSignaling: { state: 'connected', lastErrorCode: 'SFU_RELAY_UNREACHABLE' },
        },
        ['SFU_RELAY_UNREACHABLE'],
      ),
      guestShareFsm: 'running',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(videoRelayBanner()).not.toBeNull()
    })

    expect(videoRelayBanner()?.id).toBe(RIFFSYNC_VIDEO_RELAY_STATUS_ID)
    expect(videoRelayBanner()?.textContent).toContain('relay')
  })

  it('places chat drawer banner above sidebar tabs per input_handling.md', async () => {
    drawerStatusMockConfig.set({
      diagnostics: drawerDiagnostics({
        chat: { state: 'reconnecting' },
        sfuSignaling: { state: 'connected' },
      }),
      guestShareFsm: 'running',
    })
    renderRoom()

    await vi.waitFor(() => {
      expect(chatBanner()).not.toBeNull()
    })

    const tabs = container.querySelector('.riffsync-room-page__tabs')
    expect(tabs).not.toBeNull()
    expect(
      chatBanner()!.compareDocumentPosition(tabs!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
