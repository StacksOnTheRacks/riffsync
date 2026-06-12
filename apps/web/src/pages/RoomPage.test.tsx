// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomPage } from './RoomPage'
import { ChatSession } from '../room/sessions/ChatSession'
import { SfuMediaSession } from '../room/sessions/SfuMediaSession'
import { TheaterPlayback } from '../room/sessions/TheaterPlayback'
import { RoomChromeProvider } from '../room/RoomChromeProvider'

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

vi.mock('../room/sfu/mediasoupSharing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../room/sfu/mediasoupSharing')>()
  return {
    ...actual,
    connectSfuUnifiedSession: vi.fn().mockResolvedValue({
      close: vi.fn(),
      replaceHostScreenProducer: vi.fn(),
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

type WsListener = (ev?: { data?: string; code?: number; reason?: string }) => void

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  private listeners = new Map<string, Set<WsListener>>()

  constructor(url: string) {
    void url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
      for (const fn of this.listeners.get('open') ?? []) fn()
    })
  }

  addEventListener(type: string, fn: WsListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: WsListener) {
    this.listeners.get(type)?.delete(fn)
  }

  send() {}

  close() {
    this.readyState = MockWebSocket.CLOSED
    for (const fn of this.listeners.get('close') ?? []) fn({ code: 1000, reason: '' })
  }
}

describe('RoomPage session integration', () => {
  let container: HTMLDivElement
  let root: Root
  let chatDisconnectSpy: ReturnType<typeof vi.spyOn>
  let sfuDisconnectSpy: ReturnType<typeof vi.spyOn>
  let theaterDisposeSpy: ReturnType<typeof vi.spyOn>
  let webSocketCtor: ReturnType<typeof vi.fn>

  beforeEach(() => {
    MockWebSocket.instances = []
    webSocketCtor = vi.fn((url: string) => new MockWebSocket(url))
    Object.assign(webSocketCtor, {
      CONNECTING: MockWebSocket.CONNECTING,
      OPEN: MockWebSocket.OPEN,
      CLOSED: MockWebSocket.CLOSED,
    })
    vi.stubGlobal('WebSocket', webSocketCtor)

    chatDisconnectSpy = vi.spyOn(ChatSession.prototype, 'disconnect')
    sfuDisconnectSpy = vi.spyOn(SfuMediaSession.prototype, 'disconnect')
    theaterDisposeSpy = vi.spyOn(TheaterPlayback.prototype, 'dispose')

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
    await new Promise((resolve) => setTimeout(resolve, 100))
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

  it('does not import legacy session wiring or SFU modules directly', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(__dirname, 'RoomPage.tsx'), 'utf8')
    const forbidden = [
      'useRoomWebSocket',
      'useRoomSessionWiring',
      'startSfuRoomSession',
      'useChatSession',
      'useSfuMediaSession',
      'useTheaterPlayback',
      'mediasoupSharing',
      'sfuRelayStatusCopy',
      'sessions/ChatSession',
      'sessions/SfuMediaSession',
      'sessions/TheaterPlayback',
    ]
    for (const token of forbidden) {
      expect(src).not.toContain(token)
    }
    expect(src).toContain('useRoomRealtimeSdk')
  })

  it('constructs session modules on mount and tears them down on unmount', async () => {
    renderRoom()

    await vi.waitFor(() => {
      expect(container.querySelector('#riffsync-video-relay-status')).not.toBeNull()
    })

    const chatDisconnectsBeforeUnmount = chatDisconnectSpy.mock.calls.length
    const sfuDisconnectsBeforeUnmount = sfuDisconnectSpy.mock.calls.length
    const theaterDisposesBeforeUnmount = theaterDisposeSpy.mock.calls.length

    act(() => root.unmount())
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(chatDisconnectSpy.mock.calls.length).toBeGreaterThan(chatDisconnectsBeforeUnmount)
    expect(sfuDisconnectSpy.mock.calls.length).toBeGreaterThan(sfuDisconnectsBeforeUnmount)
    expect(theaterDisposeSpy.mock.calls.length).toBeGreaterThan(theaterDisposesBeforeUnmount)
  })
})
