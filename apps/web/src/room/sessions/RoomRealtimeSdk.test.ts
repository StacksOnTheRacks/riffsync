import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoomSnapshot } from '../../api/roomsApi'
import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'
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
import {
  assertDrawerReconnectCycle,
  assertNoDrawerTornDown,
  assertSiblingDrawerStaysConnected,
  emitShareStateStopped,
  joinHealthySdk,
  mockChatConnectOpensImmediately,
  mockSfuConnectOpensImmediately,
  setChatLifecycle,
  setSfuLifecycle,
} from './roomRealtimeSdkTestHelpers'

vi.mock('../audio/theaterAudioMix', () => ({
  THEATER_AUDIO_GAIN: 1,
  shouldRouteConsumerAudio: (producerClass: string | undefined) =>
    producerClass === 'host_screen' || producerClass === 'participant_av',
  createTheaterAudioMix: vi.fn(() => ({
    dispose: vi.fn(),
    setAvDisabled: vi.fn(),
    setHostVideoElement: vi.fn(),
    onConsumerEvent: vi.fn(),
    resumeIfSuspended: vi.fn().mockResolvedValue(undefined),
    getAudioContextState: vi.fn().mockReturnValue('running'),
    watchAudioContextState: vi.fn((listener: (state: AudioContextState | undefined) => void) => {
      listener('running')
      return () => undefined
    }),
  })),
}))

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

describe('RoomRealtimeSdk lifecycle mappers', () => {
  it('maps chat session statuses to drawer lifecycle enum strings', () => {
    expect(mapChatSessionStatusToDrawerState('open')).toBe('connected')
    expect(mapChatSessionStatusToDrawerState('connecting')).toBe('reconnecting')
    expect(mapChatSessionStatusToDrawerState('closed')).toBe('reconnecting')
    expect(mapChatSessionStatusToDrawerState('error')).toBe('degraded')
  })

  it('maps SFU session statuses to drawer lifecycle enum strings', () => {
    expect(mapSfuMediaSessionStatusToDrawerState('open')).toBe('connected')
    expect(mapSfuMediaSessionStatusToDrawerState('connecting')).toBe('reconnecting')
    expect(mapSfuMediaSessionStatusToDrawerState('reconnecting')).toBe('reconnecting')
    expect(mapSfuMediaSessionStatusToDrawerState('degraded')).toBe('degraded')
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
      ;(this as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
        'connected',
      )
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

describe('RoomRealtimeSdk.publishAv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is idempotent when camera and mic state already match', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-publish',
    })

    const av = (sdk as unknown as { sfu: SfuMediaSession }).sfu.participantAv
    const enableCamera = vi.spyOn(av, 'enableCamera')
    const disableCamera = vi.spyOn(av, 'disableCamera')
    const enableMic = vi.spyOn(av, 'enableMic')
    const disableMic = vi.spyOn(av, 'disableMic')
    vi.spyOn(av, 'getState').mockReturnValue({
      cameraEnabled: true,
      micEnabled: false,
      micMuted: false,
      canPublish: true,
      needsProducerToken: true,
      error: null,
      busy: false,
    })

    sdk.publishAv({ camera: true, mic: false })
    sdk.publishAv({ camera: true, mic: false })

    expect(enableCamera).not.toHaveBeenCalled()
    expect(disableCamera).not.toHaveBeenCalled()
    expect(enableMic).not.toHaveBeenCalled()
    expect(disableMic).not.toHaveBeenCalled()
  })

  it('toggles only the AV axis that changed', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-publish-partial',
    })

    const av = (sdk as unknown as { sfu: SfuMediaSession }).sfu.participantAv
    const disableCamera = vi.spyOn(av, 'disableCamera')
    const enableMic = vi.spyOn(av, 'enableMic')
    vi.spyOn(av, 'getState').mockReturnValue({
      cameraEnabled: true,
      micEnabled: false,
      micMuted: false,
      canPublish: true,
      needsProducerToken: true,
      error: null,
      busy: false,
    })

    sdk.publishAv({ camera: false, mic: true })

    expect(disableCamera).toHaveBeenCalledTimes(1)
    expect(enableMic).toHaveBeenCalledTimes(1)
  })
})

describe('RoomRealtimeSdk.subscribe', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('re-registers handlers and replaces prior host screen listener', () => {
    const onRemoteStreamA = vi.fn()
    const onRemoteStreamB = vi.fn()
    const remoteStreamListeners: Array<(stream: MediaStream | null) => void> = []
    vi.spyOn(SfuMediaSession.prototype, 'onRemoteStream').mockImplementation(function (
      this: SfuMediaSession,
      listener,
    ) {
      remoteStreamListeners.push(listener)
      return () => {
        const idx = remoteStreamListeners.indexOf(listener)
        if (idx >= 0) remoteStreamListeners.splice(idx, 1)
      }
    })

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-sub',
    })

    sdk.subscribe({ hostScreen: { onRemoteStream: onRemoteStreamA } })
    sdk.subscribe({ hostScreen: { onRemoteStream: onRemoteStreamB } })

    expect(remoteStreamListeners).toHaveLength(1)
    const stream = { id: 'remote' } as MediaStream
    remoteStreamListeners[0]?.(stream)
    expect(onRemoteStreamA).not.toHaveBeenCalled()
    expect(onRemoteStreamB).toHaveBeenCalledWith(stream)
  })

  it('does not tear down chat when subscribe handlers detach', () => {
    const disconnect = vi.spyOn(ChatSession.prototype, 'disconnect')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-sub-detach',
      wsUrl: 'wss://ws.test',
    })

    const onConsumerTrack = vi.fn()
    sdk.subscribe({ participantAv: { onConsumerTrack } })
    sdk.subscribe({})

    expect(disconnect).not.toHaveBeenCalled()
    expect(sdk.getDiagnostics().drawers.chat.state).not.toBe('torn-down')
  })

  it('routes participant_av consumer events into TheaterPlayback via subscribe', async () => {
    mockChatConnectOpensImmediately()
    const routeSfuConsumerEvent = vi
      .spyOn(TheaterPlayback.prototype, 'routeSfuConsumerEvent')
      .mockImplementation(() => undefined)
    const consumerListeners: Array<(event: SfuConsumerTrackEvent) => void> = []
    vi.spyOn(SfuMediaSession.prototype, 'onConsumerTrack').mockImplementation(function (
      listener: (event: SfuConsumerTrackEvent) => void,
    ) {
      consumerListeners.push(listener)
      return () => {
        const idx = consumerListeners.indexOf(listener)
        if (idx >= 0) consumerListeners.splice(idx, 1)
      }
    })

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-theater-sub',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
    })

    const onConsumerTrack = vi.fn()
    sdk.subscribe({ participantAv: { onConsumerTrack } })

    await vi.waitFor(() =>
      expect((sdk as unknown as { theaterBootstrapped: boolean }).theaterBootstrapped).toBe(true),
    )
    await vi.waitFor(() => expect(consumerListeners.length).toBeGreaterThan(0))

    const event: SfuConsumerTrackEvent = {
      action: 'attach',
      producerId: 'p-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: { id: 'a1' } as MediaStreamTrack,
    }
    consumerListeners[0]?.(event)

    expect(routeSfuConsumerEvent).toHaveBeenCalledWith(event)
    expect(onConsumerTrack).toHaveBeenCalledWith(event)
  })
})

describe('RoomRealtimeSdk drawer isolation (harness steps 5-6)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Harness step 5: chat-only WS drop — sibling sfuSignaling stays connected.
  it('harness step 5: chat-only forced drop reconnects without tearing down SFU', async () => {
    const sfuDisconnect = vi.spyOn(SfuMediaSession.prototype, 'disconnect')
    const sdk = await joinHealthySdk({ sessionId: 'sess-harness-chat-drop' })

    setChatLifecycle(sdk, 'reconnecting')
    const duringOutage = sdk.getDiagnostics()

    expect(sfuDisconnect).not.toHaveBeenCalled()
    assertSiblingDrawerStaysConnected(duringOutage, 'sfuSignaling')
    expect(duringOutage.drawers.chat.state).toBe('reconnecting')

    setChatLifecycle(sdk, 'connected')
    const afterRecovery = sdk.getDiagnostics()

    assertDrawerReconnectCycle(duringOutage, afterRecovery, 'chat')
    assertSiblingDrawerStaysConnected(afterRecovery, 'sfuSignaling')
  })

  // Harness step 6: SFU-only signaling drop — sibling chat stays connected.
  it('harness step 6: SFU-only forced drop reconnects without tearing down chat', async () => {
    const chatDisconnect = vi.spyOn(ChatSession.prototype, 'disconnect')
    const sdk = await joinHealthySdk({ sessionId: 'sess-harness-sfu-drop' })

    setSfuLifecycle(sdk, 'reconnecting')
    const duringOutage = sdk.getDiagnostics()

    expect(chatDisconnect).not.toHaveBeenCalled()
    assertSiblingDrawerStaysConnected(duringOutage, 'chat')
    expect(duringOutage.drawers.sfuSignaling.state).toBe('reconnecting')

    setSfuLifecycle(sdk, 'connected')
    const afterRecovery = sdk.getDiagnostics()

    assertDrawerReconnectCycle(duringOutage, afterRecovery, 'sfuSignaling')
    assertSiblingDrawerStaysConnected(afterRecovery, 'chat')
  })

  it('regression: single-plane reconnecting lifecycle never calls cross-drawer disconnect', async () => {
    const chatDisconnect = vi.spyOn(ChatSession.prototype, 'disconnect')
    const sfuDisconnect = vi.spyOn(SfuMediaSession.prototype, 'disconnect')
    const sdk = await joinHealthySdk({ sessionId: 'sess-cross-drawer-regression' })

    setChatLifecycle(sdk, 'reconnecting')
    expect(sfuDisconnect).not.toHaveBeenCalled()

    setSfuLifecycle(sdk, 'reconnecting')
    expect(chatDisconnect).not.toHaveBeenCalled()
  })

  it('share_state stopped leaves all drawers non-torn-down and does not disconnect chat', async () => {
    const chatDisconnect = vi.spyOn(ChatSession.prototype, 'disconnect')
    const handleShareStateStopped = vi.spyOn(SfuMediaSession.prototype, 'handleShareStateStopped')
    const sdk = await joinHealthySdk({ sessionId: 'sess-share-stop-isolation', isHost: false })

    emitShareStateStopped(sdk)

    expect(handleShareStateStopped).toHaveBeenCalledWith(false)
    expect(chatDisconnect).not.toHaveBeenCalled()
    assertNoDrawerTornDown(sdk.getDiagnostics())
  })

  it('surfaces CHAT_SEND_DROPPED when chat send is dropped', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-send-drop',
      wsUrl: 'wss://ws.test',
    })

    sdk.sendControl({ action: 'chat', text: 'hello', messageId: '550e8400-e29b-41d4-a716-446655440099' })

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.chat.lastErrorCode).toBe('CHAT_SEND_DROPPED')
    expect(diag.activeErrorCodes).toContain('CHAT_SEND_DROPPED')
  })
})

describe('RoomRealtimeSdk theater playback lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks theater drawer degraded when AudioContext is suspended', async () => {
    mockChatConnectOpensImmediately()
    vi.spyOn(TheaterPlayback.prototype, 'getAudioContextState').mockReturnValue('suspended')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-theater-degraded',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
    })

    await vi.waitFor(() =>
      expect((sdk as unknown as { theaterBootstrapped: boolean }).theaterBootstrapped).toBe(true),
    )

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.theaterPlayback.state).toBe('degraded')
    expect(diag.drawers.theaterPlayback.lastErrorCode).toBe('THEATER_AUDIO_SUSPENDED')
    expect(diag.drawers.theaterPlayback.audioContextState).toBe('suspended')
  })

  it('replays SFU consumers when transitioning from video chat to theater', async () => {
    mockChatConnectOpensImmediately()
    const replayActiveMediaSubscriptions = vi.spyOn(
      SfuMediaSession.prototype,
      'replayActiveMediaSubscriptions',
    )

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: { ...baseSnapshot, roomMode: 'videoChat' },
      sessionId: 'sess-mode-transition',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
    })

    sdk.subscribe({ participantAv: { onConsumerTrack: vi.fn() } })

    const chat = (sdk as unknown as { chat: ChatSession }).chat
    const roomModeListeners = (chat as unknown as {
      roomModeListeners: Set<(ev: { roomMode: string }) => void>
    }).roomModeListeners
    for (const listener of roomModeListeners) {
      listener({ roomMode: 'theater' })
    }

    await vi.waitFor(() => expect(replayActiveMediaSubscriptions).toHaveBeenCalled())
    expect(sdk.getDiagnostics().drawers.theaterPlayback.state).toBe('connected')
  })

  it('keeps theater drawer connected after share_state stopped', async () => {
    mockChatConnectOpensImmediately()
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-share-stop',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
      isHost: false,
    })

    await vi.waitFor(() =>
      expect((sdk as unknown as { theaterBootstrapped: boolean }).theaterBootstrapped).toBe(true),
    )

    const chat = (sdk as unknown as { chat: ChatSession }).chat
    const shareListeners = (chat as unknown as {
      shareStateListeners: Set<(ev: { roomId: string; state: unknown }) => void>
    }).shareStateListeners
    for (const listener of shareListeners) {
      listener({ roomId: 'room-abc', state: 'stopped' })
    }

    expect(sdk.getDiagnostics().drawers.theaterPlayback.state).toBe('connected')
  })
})

describe('RoomRealtimeSdk.getDiagnostics SFU counts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes optional SFU role and producer/consumer counts when session is open', async () => {
    mockChatConnectOpensImmediately()
    mockSfuConnectOpensImmediately()
    vi.spyOn(SfuMediaSession.prototype, 'getSignalingDiagnostics').mockReturnValue({
      role: 'consumer',
      producerCount: 0,
      consumerCount: 2,
    })

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-sfu-diag',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
    })

    await vi.waitFor(() => {
      expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('connected')
    })

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.sfuSignaling.role).toBe('consumer')
    expect(diag.drawers.sfuSignaling.producerCount).toBe(0)
    expect(diag.drawers.sfuSignaling.consumerCount).toBe(2)
  })
})
