import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoomSnapshot } from '../../api/roomsApi'
import { ChatSession } from './ChatSession'
import { SfuMediaSession } from './SfuMediaSession'
import { TheaterPlayback } from './TheaterPlayback'
import {
  DRAWER_LIFECYCLE_STATES,
  RoomRealtimeSdk,
  mapChatSessionStatusToDrawerState,
  mapSfuMediaSessionStatusToDrawerState,
  type RoomRealtimeDiagnostics,
} from './RoomRealtimeSdk'

const baseSnapshot: RoomSnapshot = {
  roomId: 'room-abc',
  hostSub: 'host-sub',
  catalogEpisodeId: 'ep-1',
  youtubeVideoId: 'yt-1',
  playbackExpectation: 'free',
  visibility: 'public',
  lastActivityAt: 1,
  version: 1,
  roomMode: 'theater',
  avDisabled: false,
  broadcastCaptureActive: false,
}

const REQUIRED_DIAGNOSTIC_KEYS = [
  'roomId',
  'sessionId',
  'asOf',
  'drawers',
  'activeErrorCodes',
] as const satisfies readonly (keyof RoomRealtimeDiagnostics)[]

const REQUIRED_DRAWER_KEYS = ['chat', 'sfuSignaling', 'theaterPlayback'] as const

function assertStableDiagnosticsContract(diag: RoomRealtimeDiagnostics): void {
  for (const key of REQUIRED_DIAGNOSTIC_KEYS) {
    expect(diag).toHaveProperty(key)
  }

  for (const drawerKey of REQUIRED_DRAWER_KEYS) {
    expect(diag.drawers).toHaveProperty(drawerKey)
    expect(diag.drawers[drawerKey]).toHaveProperty('state')
    expect(DRAWER_LIFECYCLE_STATES).toContain(diag.drawers[drawerKey].state)
  }

  expect(Array.isArray(diag.activeErrorCodes)).toBe(true)
  expect(diag.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/)
}

function mockChatConnectOpensImmediately(): void {
  vi.spyOn(ChatSession.prototype, 'connect').mockImplementation(function (this: ChatSession) {
    ;(this as unknown as { setStatus: (status: string) => void }).setStatus('open')
  })
}

function mockSfuConnectOpensImmediately(): void {
  vi.spyOn(SfuMediaSession.prototype, 'connect').mockImplementation(function (this: SfuMediaSession) {
    ;(this as unknown as { setStatus: (status: string) => void }).setStatus('open')
  })
}

describe('RoomRealtimeSdk lifecycle mappers', () => {
  it('maps chat session statuses to drawer lifecycle enum strings', () => {
    expect(mapChatSessionStatusToDrawerState('open')).toBe('connected')
    expect(mapChatSessionStatusToDrawerState('connecting')).toBe('reconnecting')
    expect(mapChatSessionStatusToDrawerState('error')).toBe('degraded')
    expect(mapChatSessionStatusToDrawerState('idle')).toBe('torn-down')
    expect(mapChatSessionStatusToDrawerState('closed')).toBe('torn-down')
  })

  it('maps SFU session statuses to drawer lifecycle enum strings', () => {
    expect(mapSfuMediaSessionStatusToDrawerState('open')).toBe('connected')
    expect(mapSfuMediaSessionStatusToDrawerState('connecting')).toBe('reconnecting')
    expect(mapSfuMediaSessionStatusToDrawerState('reconnecting')).toBe('reconnecting')
    expect(mapSfuMediaSessionStatusToDrawerState('error')).toBe('degraded')
    expect(mapSfuMediaSessionStatusToDrawerState('idle')).toBe('torn-down')
    expect(mapSfuMediaSessionStatusToDrawerState('closed')).toBe('torn-down')
  })
})

describe('RoomRealtimeSdk.getDiagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns stable JSON field names before join', () => {
    const sdk = new RoomRealtimeSdk()
    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.drawers.chat.state).toBe('torn-down')
    expect(diag.drawers.sfuSignaling.state).toBe('torn-down')
    expect(diag.drawers.theaterPlayback.state).toBe('torn-down')
    expect(diag.activeErrorCodes).toEqual([])
  })

  it('returns stable diagnostics shape after join without URLs (modules constructed, not bootstrapped)', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-diag-1',
    })

    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.roomId).toBe('room-abc')
    expect(diag.sessionId).toBe('sess-diag-1')
    expect(diag.drawers.theaterPlayback.state).toBe('torn-down')
  })

  it('marks theater drawer connected after media bootstrap on theater layout', async () => {
    const getIceServers = vi.fn(async () => [{ urls: 'stun:stun.test' }])
    mockChatConnectOpensImmediately()
    const sfuConnectSpy = vi.spyOn(SfuMediaSession.prototype, 'connect')
    const theaterConfigureSpy = vi.spyOn(TheaterPlayback.prototype, 'configure')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-diag-1',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers,
    })

    await vi.waitFor(() => expect(theaterConfigureSpy).toHaveBeenCalled())

    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.drawers.chat.state).toBe('connected')
    expect(diag.drawers.theaterPlayback.state).toBe('connected')
    expect(sfuConnectSpy).toHaveBeenCalled()
    expect(theaterConfigureSpy).toHaveBeenCalled()
  })

  it('marks theater drawer torn-down when layout is video chat', async () => {
    mockChatConnectOpensImmediately()

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: { ...baseSnapshot, roomMode: 'videoChat' },
      sessionId: 'sess-diag-2',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
    })

    await vi.waitFor(() => expect(sdk.getDiagnostics().drawers.chat.state).toBe('connected'))

    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.drawers.theaterPlayback.state).toBe('torn-down')
  })

  it('matches diagnostics contract snapshot for harness assertions', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-snapshot',
    })

    const diag = sdk.getDiagnostics()
    expect({
      topLevelKeys: REQUIRED_DIAGNOSTIC_KEYS.slice().sort(),
      drawerKeys: REQUIRED_DRAWER_KEYS.slice().sort(),
      lifecycleStates: DRAWER_LIFECYCLE_STATES.slice(),
      sample: {
        roomId: diag.roomId,
        sessionId: diag.sessionId,
        drawers: {
          chat: { state: diag.drawers.chat.state },
          sfuSignaling: { state: diag.drawers.sfuSignaling.state },
          theaterPlayback: { state: diag.drawers.theaterPlayback.state },
        },
        activeErrorCodes: diag.activeErrorCodes,
      },
    }).toMatchInlineSnapshot(`
      {
        "drawerKeys": [
          "chat",
          "sfuSignaling",
          "theaterPlayback",
        ],
        "lifecycleStates": [
          "connected",
          "reconnecting",
          "degraded",
          "torn-down",
        ],
        "sample": {
          "activeErrorCodes": [],
          "drawers": {
            "chat": {
              "state": "torn-down",
            },
            "sfuSignaling": {
              "state": "torn-down",
            },
            "theaterPlayback": {
              "state": "torn-down",
            },
          },
          "roomId": "room-abc",
          "sessionId": "sess-snapshot",
        },
        "topLevelKeys": [
          "activeErrorCodes",
          "asOf",
          "drawers",
          "roomId",
          "sessionId",
        ],
      }
    `)
  })
})

describe('RoomRealtimeSdk.join bootstrap order', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warms ICE then connects SFU then initializes theater after chat opens', async () => {
    const order: string[] = []
    const getIceServers = vi.fn(async () => {
      order.push('ice')
      return [{ urls: 'stun:stun.test' }]
    })

    vi.spyOn(ChatSession.prototype, 'connect').mockImplementation(function (this: ChatSession) {
      order.push('chat-connect')
      ;(this as unknown as { setStatus: (status: string) => void }).setStatus('open')
    })
    vi.spyOn(SfuMediaSession.prototype, 'connect').mockImplementation(function (
      this: SfuMediaSession,
    ) {
      order.push('sfu-connect')
    })
    vi.spyOn(TheaterPlayback.prototype, 'configure').mockImplementation(function (
      this: TheaterPlayback,
    ) {
      order.push('theater-configure')
    })

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-order',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers,
    })

    await vi.waitFor(() => expect(order).toContain('theater-configure'))

    expect(order.indexOf('chat-connect')).toBeLessThan(order.indexOf('ice'))
    expect(order.indexOf('ice')).toBeLessThan(order.indexOf('sfu-connect'))
    expect(order.indexOf('sfu-connect')).toBeLessThan(order.indexOf('theater-configure'))
  })
})

describe('RoomRealtimeSdk media policy wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards share_state stopped to SfuMediaSession without tearing down chat', () => {
    const handleShareStateStopped = vi.spyOn(SfuMediaSession.prototype, 'handleShareStateStopped')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-policy',
      wsUrl: 'wss://ws.test',
      isHost: false,
    })

    const chat = (sdk as unknown as { chat: ChatSession }).chat
    const shareListeners = (chat as unknown as {
      shareStateListeners: Set<(ev: { roomId: string; state: unknown }) => void>
    }).shareStateListeners
    for (const listener of shareListeners) {
      listener({ roomId: 'room-abc', state: 'stopped' })
    }

    expect(handleShareStateStopped).toHaveBeenCalledWith(false)
  })

  it('forwards av_disabled kill switch to SfuMediaSession', () => {
    const handleAvDisabledKillSwitch = vi.spyOn(SfuMediaSession.prototype, 'handleAvDisabledKillSwitch')
    const updatePublishGate = vi.spyOn(SfuMediaSession.prototype, 'updatePublishGate')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-av',
      wsUrl: 'wss://ws.test',
    })

    const chat = (sdk as unknown as { chat: ChatSession }).chat
    const avListeners = (chat as unknown as {
      avDisabledListeners: Set<(ev: { avDisabled: boolean }) => void>
    }).avDisabledListeners
    for (const listener of avListeners) {
      listener({ avDisabled: true })
    }

    expect(updatePublishGate).toHaveBeenCalledWith({ avDisabled: true })
    expect(handleAvDisabledKillSwitch).toHaveBeenCalled()
  })
})

describe('RoomRealtimeSdk public surface', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes join, publishAv, subscribe, getDiagnostics, and teardown', () => {
    const sdk = new RoomRealtimeSdk()
    expect(typeof sdk.join).toBe('function')
    expect(typeof sdk.publishAv).toBe('function')
    expect(typeof sdk.subscribe).toBe('function')
    expect(typeof sdk.getDiagnostics).toBe('function')
    expect(typeof sdk.teardown).toBe('function')
  })

  it('teardown resets diagnostics to torn-down drawers', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-teardown',
    })
    sdk.teardown()

    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.roomId).toBe('')
    expect(diag.sessionId).toBe('')
    expect(diag.drawers.chat.state).toBe('torn-down')
    expect(diag.drawers.sfuSignaling.state).toBe('torn-down')
    expect(diag.drawers.theaterPlayback.state).toBe('torn-down')
  })

  it('calls onDiagnosticsChange when drawer status changes', async () => {
    mockChatConnectOpensImmediately()
    const onDiagnosticsChange = vi.fn()

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-cb',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
      onDiagnosticsChange,
    })

    await vi.waitFor(() => {
      const lastCall = onDiagnosticsChange.mock.calls.at(-1)?.[0]
      expect(lastCall?.drawers.chat.state).toBe('connected')
    })
  })

  it('reports connected chat and SFU drawers when modules are healthy after bootstrap', async () => {
    mockChatConnectOpensImmediately()
    mockSfuConnectOpensImmediately()

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-healthy',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [{ urls: 'stun:stun.test' }],
    })

    await vi.waitFor(() => {
      const diag = sdk.getDiagnostics()
      expect(diag.drawers.sfuSignaling.state).toBe('connected')
    })

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.chat.state).toBe('connected')
    expect(diag.drawers.sfuSignaling.state).toBe('connected')
    expect(diag.drawers.theaterPlayback.state).toBe('connected')
  })
})
