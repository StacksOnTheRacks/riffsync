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
  emitShareStateStarted,
  emitShareStateStopped,
  emitSfuDrawerError,
  getChatSession,
  getSfuSession,
  joinHealthySdk,
  mockChatConnectOpensImmediately,
  mockSfuConnectOpensImmediately,
  setChatLifecycle,
  setSfuLifecycle,
} from './roomRealtimeSdkTestHelpers'
import {
  mapSfuConfigMediaCodeToDrawerError,
  mapSfuMediaCodeToDrawerError,
  producerClosedError,
} from '../realtimeDrawerErrors'

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

  it('bootstraps SFU from room join gates without waiting for chat open', async () => {
    const sfuConnect = vi.spyOn(SfuMediaSession.prototype, 'connect')
    vi.spyOn(ChatSession.prototype, 'connect').mockImplementation(function (this: ChatSession) {
      ;(this as unknown as { setStatus: (status: string) => void }).setStatus('connecting')
      ;(this as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
        'reconnecting',
      )
    })

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-join-gate',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [{ urls: 'stun:stun.test' }],
    })

    await vi.waitFor(() => expect(sfuConnect).toHaveBeenCalled())
    expect(sdk.getDiagnostics().drawers.chat.state).toBe('reconnecting')
    expect(sfuConnect).toHaveBeenCalledTimes(1)
  })

  it('#205 regression: chat reconnecting flap preserves needsProducerToken while SFU stays connected', async () => {
    const videoTrack = { kind: 'video', readyState: 'live', stop: vi.fn(), id: 'v1' }
    const audioTrack = { kind: 'audio', readyState: 'live', stop: vi.fn(), id: 'a1' }
    const stream = {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
      getTracks: () => [videoTrack, audioTrack],
      removeTrack: vi.fn(),
    } as unknown as MediaStream

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    })

    const sdk = await joinHealthySdk({ sessionId: 'sess-205-chat-flap' })
    const av = getSfuSession(sdk).participantAv
    getSfuSession(sdk).updatePublishGate({ fanToken: 'fan-jwt' })
    await av.enableCamera()
    await av.enableMic()

    await vi.waitFor(() => {
      expect(av.getState().needsProducerToken).toBe(true)
    })

    const beforeFlap = av.getState()
    expect(beforeFlap.cameraEnabled).toBe(true)
    expect(beforeFlap.micEnabled).toBe(true)

    const chat = getChatSession(sdk)
    ;(chat as unknown as { setStatus: (status: string) => void }).setStatus('closed')
    setChatLifecycle(sdk, 'reconnecting')

    const afterFlap = av.getState()
    expect(afterFlap.needsProducerToken).toBe(true)
    expect(afterFlap.cameraEnabled).toBe(true)
    expect(afterFlap.micEnabled).toBe(true)
    expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('connected')
    expect(sdk.getDiagnostics().drawers.chat.state).toBe('reconnecting')

    vi.unstubAllGlobals()
  })

  it('does not update publish gate on chat flap while SFU stays connected', async () => {
    const sfuDisconnect = vi.spyOn(SfuMediaSession.prototype, 'disconnect')
    const updatePublishGate = vi.spyOn(SfuMediaSession.prototype, 'updatePublishGate')
    const sdk = await joinHealthySdk({ sessionId: 'sess-publish-gate-flap' })
    const chat = getChatSession(sdk)

    updatePublishGate.mockClear()
    ;(chat as unknown as { setStatus: (status: string) => void }).setStatus('closed')
    ;(chat as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
      'reconnecting',
    )

    expect(sfuDisconnect).not.toHaveBeenCalled()
    expect(updatePublishGate).not.toHaveBeenCalled()
    expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('connected')

    updatePublishGate.mockClear()
    ;(chat as unknown as { setStatus: (status: string) => void }).setStatus('open')
    ;(chat as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
      'connected',
    )

    expect(sfuDisconnect).not.toHaveBeenCalled()
    expect(updatePublishGate).not.toHaveBeenCalled()
    expect(sdk.getDiagnostics().drawers.chat.state).toBe('connected')
    expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('connected')
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

  it('share_state started does not forward to handleShareStateStopped (#146 Guest theater started)', () => {
    const handleShareStateStopped = vi.spyOn(SfuMediaSession.prototype, 'handleShareStateStopped')
    const detachConsumerClass = vi.fn()
    vi.spyOn(SfuMediaSession.prototype, 'connect').mockImplementation(function (this: SfuMediaSession) {
      ;(this as unknown as { setStatus: (status: string) => void }).setStatus('open')
      ;(this as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
        'connected',
      )
      ;(
        this as unknown as {
          sessionHandle: { detachConsumerClass: ReturnType<typeof vi.fn> }
        }
      ).sessionHandle = { detachConsumerClass }
    })

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-share-started',
      wsUrl: 'wss://ws.test',
      isHost: false,
    })

    emitShareStateStarted(sdk)

    expect(handleShareStateStopped).not.toHaveBeenCalled()
    expect(detachConsumerClass).not.toHaveBeenCalled()
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

  it('does not double-toggle when { camera: false, mic: true } already matches state', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-publish-partial-idempotent',
    })

    const av = (sdk as unknown as { sfu: SfuMediaSession }).sfu.participantAv
    const enableCamera = vi.spyOn(av, 'enableCamera')
    const disableCamera = vi.spyOn(av, 'disableCamera')
    const enableMic = vi.spyOn(av, 'enableMic')
    const disableMic = vi.spyOn(av, 'disableMic')
    vi.spyOn(av, 'getState').mockReturnValue({
      cameraEnabled: false,
      micEnabled: true,
      micMuted: false,
      canPublish: true,
      needsProducerToken: true,
      error: null,
      busy: false,
    })

    sdk.publishAv({ camera: false, mic: true })
    sdk.publishAv({ camera: false, mic: true })

    expect(enableCamera).not.toHaveBeenCalled()
    expect(disableCamera).not.toHaveBeenCalled()
    expect(enableMic).not.toHaveBeenCalled()
    expect(disableMic).not.toHaveBeenCalled()
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
    const stream = {
      id: 'remote',
      getTracks: () => [],
      getVideoTracks: () => [],
    } as unknown as MediaStream
    remoteStreamListeners[0]?.(stream)
    expect(onRemoteStreamA).not.toHaveBeenCalled()
    expect(onRemoteStreamB).toHaveBeenCalledWith(stream)
  })

  it('applies a guest video element bound before join to the theater (no_element regression)', () => {
    const setGuestVideoElement = vi.spyOn(TheaterPlayback.prototype, 'setGuestVideoElement')

    const sdk = new RoomRealtimeSdk()
    const element = { srcObject: null } as unknown as HTMLVideoElement
    // React's <video> ref fires on mount, before join() constructs the theater.
    sdk.bindGuestVideo(element)

    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-bind-before-join',
    })

    expect(setGuestVideoElement).toHaveBeenCalledWith(element)
  })

  it('re-applies the cached guest video element when join rebuilds the theater on reconnect', () => {
    const sdk = new RoomRealtimeSdk()
    const element = { srcObject: null } as unknown as HTMLVideoElement
    sdk.bindGuestVideo(element)
    sdk.join('room-abc', { roomSnapshot: baseSnapshot, sessionId: 'sess-reconnect-1' })

    const setGuestVideoElement = vi.spyOn(TheaterPlayback.prototype, 'setGuestVideoElement')
    // A reconnect calls join() again and constructs a fresh theater; the element must follow.
    sdk.join('room-abc', { roomSnapshot: baseSnapshot, sessionId: 'sess-reconnect-2' })

    expect(setGuestVideoElement).toHaveBeenCalledWith(element)
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

/** M18 / #202 drawer isolation matrix; see also `RoomRealtimeSdk.drawerIsolationRegression.test.ts`. */
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
    const sfuDisconnect = vi.spyOn(SfuMediaSession.prototype, 'disconnect')
    const handleAvDisabledKillSwitch = vi.spyOn(
      SfuMediaSession.prototype,
      'handleAvDisabledKillSwitch',
    )
    const handleShareStateStopped = vi.spyOn(SfuMediaSession.prototype, 'handleShareStateStopped')
    const sdk = await joinHealthySdk({ sessionId: 'sess-share-stop-isolation', isHost: false })

    emitShareStateStopped(sdk)

    expect(handleShareStateStopped).toHaveBeenCalledWith(false)
    expect(chatDisconnect).not.toHaveBeenCalled()
    expect(sfuDisconnect).not.toHaveBeenCalled()
    expect(handleAvDisabledKillSwitch).not.toHaveBeenCalled()
    expect(getChatSession(sdk).getStatus()).toBe('open')
    assertNoDrawerTornDown(sdk.getDiagnostics())
  })

  it('surfaces CHAT_SEND_DROPPED when chat send is dropped', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-send-drop',
      wsUrl: 'wss://ws.test',
    })

    expect(
      sdk.sendControl({ action: 'chat', text: 'hello', messageId: '550e8400-e29b-41d4-a716-446655440099' }),
    ).toBe(false)

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.chat.lastErrorCode).toBe('CHAT_SEND_DROPPED')
    expect(diag.activeErrorCodes).toContain('CHAT_SEND_DROPPED')
  })

  it('returns true from sendControl when chat session accepts outbound', async () => {
    mockChatConnectOpensImmediately()
    vi.spyOn(ChatSession.prototype, 'send').mockReturnValue(true)

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-send-ok',
      wsUrl: 'wss://ws.test',
    })

    await vi.waitFor(() => expect(sdk.getDiagnostics().drawers.chat.state).toBe('connected'))

    expect(
      sdk.sendControl({ action: 'chat', text: 'hello', messageId: '550e8400-e29b-41d4-a716-446655440100' }),
    ).toBe(true)
    expect(sdk.getDiagnostics().drawers.chat.lastErrorCode).toBeUndefined()
  })
})

/** M18 / #208 send-path regressions; names cross-ref parent #149 AC and execution_model.md cross-drawer table. */
describe('RoomRealtimeSdk #208 chat send survives SFU-only outage', () => {
  class MockOpenWebSocket {
    static OPEN = 1
    static CONNECTING = 0
    static CLOSING = 2
    static CLOSED = 3
    readyState = MockOpenWebSocket.OPEN
    send = vi.fn()
  }

  const chatPayload = {
    action: 'chat',
    text: 'hello',
    messageId: '550e8400-e29b-41d4-a716-446655440208',
  }

  function attachOpenChatSocket(sdk: RoomRealtimeSdk): void {
    vi.stubGlobal('WebSocket', MockOpenWebSocket as unknown as typeof WebSocket)
    const chat = getChatSession(sdk)
    ;(chat as unknown as { ws: WebSocket | null }).ws =
      new MockOpenWebSocket() as unknown as WebSocket
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('#208 SFU reconnecting: sendControl succeeds without CHAT_SEND_DROPPED', async () => {
    const sdk = await joinHealthySdk({ sessionId: 'sess-208-sfu-reconnecting' })
    attachOpenChatSocket(sdk)

    const sfu = getSfuSession(sdk)
    ;(sfu as unknown as { setStatus: (status: string) => void }).setStatus('reconnecting')
    setSfuLifecycle(sdk, 'reconnecting')

    expect(getChatSession(sdk).getStatus()).toBe('open')
    expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('reconnecting')

    expect(sdk.sendControl(chatPayload)).toBe(true)

    const diag = sdk.getDiagnostics()
    expect(diag.activeErrorCodes).not.toContain('CHAT_SEND_DROPPED')
    expect(diag.drawers.chat.lastErrorCode).toBeUndefined()
  })

  it('#208 SFU error/degraded: sendControl succeeds without CHAT_SEND_DROPPED', async () => {
    const sdk = await joinHealthySdk({ sessionId: 'sess-208-sfu-degraded' })
    attachOpenChatSocket(sdk)

    const sfu = getSfuSession(sdk)
    ;(sfu as unknown as { setStatus: (status: string) => void }).setStatus('error')
    setSfuLifecycle(sdk, 'degraded')

    expect(getChatSession(sdk).getStatus()).toBe('open')
    expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('degraded')

    expect(sdk.sendControl(chatPayload)).toBe(true)

    const diag = sdk.getDiagnostics()
    expect(diag.activeErrorCodes).not.toContain('CHAT_SEND_DROPPED')
    expect(diag.drawers.chat.lastErrorCode).toBeUndefined()
  })

  it('#208 chat WS not open: sendControl fails with CHAT_SEND_DROPPED while SFU stays connected', async () => {
    const sdk = await joinHealthySdk({ sessionId: 'sess-208-chat-send-drop' })

    const chat = getChatSession(sdk)
    ;(chat as unknown as { setStatus: (status: string) => void }).setStatus('closed')
    ;(chat as unknown as { ws: WebSocket | null }).ws = null

    expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('connected')

    expect(sdk.sendControl(chatPayload)).toBe(false)

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.chat.lastErrorCode).toBe('CHAT_SEND_DROPPED')
    expect(diag.activeErrorCodes).toContain('CHAT_SEND_DROPPED')
    expect(diag.drawers.sfuSignaling.state).toBe('connected')
  })

  it('#208 cross-drawer table: SFU reconnect does not disconnect chat or block sendControl', async () => {
    const chatDisconnect = vi.spyOn(ChatSession.prototype, 'disconnect')
    const sdk = await joinHealthySdk({ sessionId: 'sess-208-sfu-no-chat-block' })
    attachOpenChatSocket(sdk)

    setSfuLifecycle(sdk, 'reconnecting')
    ;(getSfuSession(sdk) as unknown as { setStatus: (status: string) => void }).setStatus(
      'reconnecting',
    )

    expect(chatDisconnect).not.toHaveBeenCalled()
    expect(getChatSession(sdk).getStatus()).toBe('open')
    expect(sdk.sendControl(chatPayload)).toBe(true)
    expect(sdk.getDiagnostics().activeErrorCodes).not.toContain('CHAT_SEND_DROPPED')
  })
})

describe('RoomRealtimeSdk.getDiagnostics activeErrorCodes contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes SIGNALING_TIMEOUT from SFU drawer errors', async () => {
    const sdk = await joinHealthySdk({ sessionId: 'sess-signaling-timeout' })
    emitSfuDrawerError(sdk, mapSfuMediaCodeToDrawerError('signaling_failed'))

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.sfuSignaling.lastErrorCode).toBe('SIGNALING_TIMEOUT')
    expect(diag.activeErrorCodes).toEqual(['SIGNALING_TIMEOUT'])
  })

  it('includes config-class LOCAL_SFU_UNREACHABLE from SFU drawer errors', async () => {
    const sdk = await joinHealthySdk({ sessionId: 'sess-config-error' })
    emitSfuDrawerError(sdk, mapSfuConfigMediaCodeToDrawerError('local_sfu_unreachable'))

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.sfuSignaling.lastErrorCode).toBe('LOCAL_SFU_UNREACHABLE')
    expect(diag.activeErrorCodes).toEqual(['LOCAL_SFU_UNREACHABLE'])
  })

  it('collects activeErrorCodes from multiple drawers without duplicates', async () => {
    const sdk = await joinHealthySdk({ sessionId: 'sess-multi-drawer' })
    sdk.sendControl({ action: 'chat', text: 'hello', messageId: '550e8400-e29b-41d4-a716-446655440099' })
    emitSfuDrawerError(sdk, mapSfuMediaCodeToDrawerError('signaling_failed'))

    const diag = sdk.getDiagnostics()
    expect(diag.activeErrorCodes).toEqual(['CHAT_SEND_DROPPED', 'SIGNALING_TIMEOUT'])
  })

  it('excludes PRODUCER_CLOSED from activeErrorCodes after consumer detach simulation', async () => {
    mockChatConnectOpensImmediately()
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

    const sdk = await joinHealthySdk({ sessionId: 'sess-producer-closed' })
    sdk.subscribe({ participantAv: { onConsumerTrack: vi.fn() } })
    await vi.waitFor(() => expect(consumerListeners.length).toBeGreaterThan(0))

    consumerListeners[0]?.({
      action: 'detach',
      producerId: 'p-1',
    })

    emitSfuDrawerError(sdk, producerClosedError('p-1'))

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.sfuSignaling.lastErrorCode).toBe('PRODUCER_CLOSED')
    expect(diag.activeErrorCodes).not.toContain('PRODUCER_CLOSED')
    expect(diag.activeErrorCodes).toEqual([])
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
      // Suspended-AudioContext degradation only applies to the experimental participant mix; the
      // default tab-share path plays host_screen audio through the element with no mix.
      mixEnabled: true,
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

  it('theater guest share_state started keeps SFU open and re-attaches on newProducer stream (#146 Guest theater started)', async () => {
    mockChatConnectOpensImmediately()
    mockSfuConnectOpensImmediately()
    const sfuDisconnect = vi.spyOn(SfuMediaSession.prototype, 'disconnect')
    const remoteStreamListeners: Array<(stream: MediaStream | null) => void> = []
    vi.spyOn(SfuMediaSession.prototype, 'onRemoteStream').mockImplementation(function (
      listener: (stream: MediaStream | null) => void,
    ) {
      remoteStreamListeners.push(listener)
      return () => {
        const idx = remoteStreamListeners.indexOf(listener)
        if (idx >= 0) remoteStreamListeners.splice(idx, 1)
      }
    })
    const setGuestRemote = vi.spyOn(TheaterPlayback.prototype, 'setGuestRemote')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-share-started-theater',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
      isHost: false,
    })

    await vi.waitFor(() =>
      expect((sdk as unknown as { theaterBootstrapped: boolean }).theaterBootstrapped).toBe(true),
    )

    sdk.subscribe({ hostScreen: { onRemoteStream: vi.fn() } })
    setGuestRemote.mockClear()

    emitShareStateStarted(sdk)

    expect(sfuDisconnect).not.toHaveBeenCalled()
    expect(getSfuSession(sdk).getStatus()).toBe('open')
    expect(setGuestRemote).not.toHaveBeenCalled()

    const pendingStream = {
      getTracks: () => [{ kind: 'video', readyState: 'live' }],
      getVideoTracks: () => [{ kind: 'video', readyState: 'live' }],
    } as MediaStream
    remoteStreamListeners[0]?.(pendingStream)

    expect(setGuestRemote).toHaveBeenCalledWith(pendingStream)
  })

  it('videoChat guest share_state started leaves guestRemote null (#146 Guest videoChat started)', async () => {
    mockChatConnectOpensImmediately()
    mockSfuConnectOpensImmediately()
    const remoteStreamListeners: Array<(stream: MediaStream | null) => void> = []
    vi.spyOn(SfuMediaSession.prototype, 'onRemoteStream').mockImplementation(function (
      listener: (stream: MediaStream | null) => void,
    ) {
      remoteStreamListeners.push(listener)
      return () => {
        const idx = remoteStreamListeners.indexOf(listener)
        if (idx >= 0) remoteStreamListeners.splice(idx, 1)
      }
    })
    const setGuestRemote = vi.spyOn(TheaterPlayback.prototype, 'setGuestRemote')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: { ...baseSnapshot, roomMode: 'videoChat' },
      sessionId: 'sess-share-started-videochat',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
      isHost: false,
    })

    sdk.subscribe({ hostScreen: { onRemoteStream: vi.fn() } })

    emitShareStateStarted(sdk)

    const hostScreenStream = {
      getTracks: () => [{ kind: 'video', readyState: 'live' }],
      getVideoTracks: () => [{ kind: 'video', readyState: 'live' }],
    } as MediaStream
    remoteStreamListeners[0]?.(hostScreenStream)

    expect(setGuestRemote).not.toHaveBeenCalled()
    expect((sdk as unknown as { theaterLayoutActive: boolean }).theaterLayoutActive).toBe(false)
  })

  it('routes emitRemoteStream(null) to TheaterPlayback.setGuestRemote for theater guests', async () => {
    mockChatConnectOpensImmediately()
    mockSfuConnectOpensImmediately()
    const setGuestRemote = vi.spyOn(TheaterPlayback.prototype, 'setGuestRemote')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-guest-remote-null',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [],
      isHost: false,
    })

    await vi.waitFor(() =>
      expect((sdk as unknown as { theaterBootstrapped: boolean }).theaterBootstrapped).toBe(true),
    )

    sdk.subscribe({ hostScreen: { onRemoteStream: vi.fn() } })
    setGuestRemote.mockClear()

    getSfuSession(sdk).handleShareStateStopped(false)

    expect(setGuestRemote).toHaveBeenCalledWith(null)
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

describe('RoomRealtimeSdk.updateDisplayName', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reconnects only the chat plane and leaves the SFU session untouched', async () => {
    const sdk = await joinHealthySdk({ isHost: true })
    const chatConnect = vi.mocked(ChatSession.prototype.connect)
    const sfuConnect = vi.mocked(SfuMediaSession.prototype.connect)
    const chatCallsAfterJoin = chatConnect.mock.calls.length
    const sfuCallsAfterJoin = sfuConnect.mock.calls.length

    sdk.updateDisplayName('Fresh Name')

    expect(chatConnect.mock.calls.length).toBe(chatCallsAfterJoin + 1)
    expect(chatConnect.mock.calls.at(-1)?.[0]?.displayName).toBe('Fresh Name')
    // The media plane must not reconnect; renaming cannot interrupt anyone's video/audio.
    expect(sfuConnect.mock.calls.length).toBe(sfuCallsAfterJoin)

    const diag = sdk.getDiagnostics()
    expect(diag.drawers.sfuSignaling.state).toBe('connected')
    expect(diag.drawers.chat.state).toBe('connected')
  })

  it('is a no-op when the display name is unchanged', async () => {
    const sdk = await joinHealthySdk()
    const chatConnect = vi.mocked(ChatSession.prototype.connect)

    sdk.updateDisplayName('Stable Name')
    const callsAfterFirst = chatConnect.mock.calls.length

    sdk.updateDisplayName('Stable Name')

    expect(chatConnect.mock.calls.length).toBe(callsAfterFirst)
  })
})
