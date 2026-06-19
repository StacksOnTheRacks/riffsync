/**
 * M18 drawer isolation regressions (#202).
 * Harness step 5/6 names cross-ref `.ai/runtime/lifecycle_shutdown.md` and parent #147.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import { connectSfuUnifiedSession, type SfuSessionEndReason } from '../sfu/mediasoupSharing'
import { ChatSession } from './ChatSession'
import { SfuMediaSession } from './SfuMediaSession'
import { RoomRealtimeSdk } from './RoomRealtimeSdk'
import {
  assertDrawerReconnectCycle,
  assertSiblingDrawerStaysConnected,
  emitLatestHarnessChatSocketClose,
  harnessBaseSnapshot,
  installHarnessChatMockWebSocket,
  mockSfuConnectOpensImmediately,
  openLatestHarnessChatSocket,
} from './roomRealtimeSdkTestHelpers'

vi.mock('../realtimeDiagnostics', () => ({
  recordInboundWsMessage: vi.fn(),
  recordOutboundDropped: vi.fn(),
  recordOutboundSent: vi.fn(),
  recordWsClose: vi.fn(),
  recordWsConnectAttempt: vi.fn(),
  recordWsErrorEvent: vi.fn(),
  recordWsOpen: vi.fn(),
}))

vi.mock('../../api/webrtcSfuApi', () => ({
  fetchSfuJoinToken: vi.fn(),
}))

vi.mock('../sfu/mediasoupSharing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sfu/mediasoupSharing')>()
  return {
    ...actual,
    connectSfuUnifiedSession: vi.fn(),
    resolveSfuWsBaseForToken: vi.fn((tok: { wsUrl?: string }) => tok.wsUrl ?? null),
  }
})

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

function mockSfuSessionWithControllableEnd(): {
  endSession: (reason: SfuSessionEndReason) => void
} {
  let resolveEnd!: (reason: SfuSessionEndReason) => void
  const sessionEnded = new Promise<SfuSessionEndReason>((resolve) => {
    resolveEnd = resolve
  })

  vi.mocked(fetchSfuJoinToken).mockResolvedValue({
    token: 'tok',
    role: 'consumer',
    wsUrl: 'ws://127.0.0.1:3000',
    expiresInSeconds: 900,
  })

  vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => ({
    ready: Promise.resolve(),
    sessionEnded,
    close: vi.fn(),
    unpublishProducerKind: vi.fn(),
    unpublishProducerClass: vi.fn(),
    publishStream: vi.fn(),
    supportsPublish: false,
    tokenRole: 'consumer',
    getProducerCount: () => 0,
    getConsumerCount: () => 0,
    hasProducerClass: () => false,
    hasConsumerClass: () => false,
    detachConsumerClass: vi.fn(),
    pauseProducerKind: vi.fn(),
    resumeProducerKind: vi.fn(),
    replayConsumerTracks: vi.fn(),
  }))

  return {
    endSession: (reason) => resolveEnd(reason),
  }
}

describe('RoomRealtimeSdk M18 drawer isolation regressions (#202)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Harness step 5 (chat-only): `harness step 5: chat-only simulated WS close`
  it('harness step 5: chat-only simulated WS close keeps sfuSignaling connected', async () => {
    vi.useFakeTimers()
    installHarnessChatMockWebSocket()
    mockSfuConnectOpensImmediately()

    const sfuDisconnect = vi.spyOn(SfuMediaSession.prototype, 'disconnect')

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: harnessBaseSnapshot,
      sessionId: 'sess-m18-chat-ws-close',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [{ urls: 'stun:stun.test' }],
    })

    openLatestHarnessChatSocket()

    await vi.waitFor(() => {
      const diag = sdk.getDiagnostics()
      expect(diag.drawers.chat.state).toBe('connected')
      expect(diag.drawers.sfuSignaling.state).toBe('connected')
    })

    emitLatestHarnessChatSocketClose()
    const duringOutage = sdk.getDiagnostics()

    expect(sfuDisconnect).not.toHaveBeenCalled()
    expect(duringOutage.drawers.chat.state).toBe('reconnecting')
    assertSiblingDrawerStaysConnected(duringOutage, 'sfuSignaling')

    vi.runOnlyPendingTimers()
    openLatestHarnessChatSocket()
    const afterRecovery = sdk.getDiagnostics()

    assertDrawerReconnectCycle(duringOutage, afterRecovery, 'chat')
    assertSiblingDrawerStaysConnected(afterRecovery, 'sfuSignaling')
  })

  // Harness step 6 (SFU-only): `harness step 6: SFU-only simulated signaling close`
  it('harness step 6: SFU-only simulated signaling close keeps chat connected and send path alive', async () => {
    const chatDisconnect = vi.spyOn(ChatSession.prototype, 'disconnect')
    const { endSession } = mockSfuSessionWithControllableEnd()

    vi.spyOn(ChatSession.prototype, 'connect').mockImplementation(function (this: ChatSession) {
      ;(this as unknown as { setStatus: (status: string) => void }).setStatus('open')
      ;(this as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
        'connected',
      )
    })

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: harnessBaseSnapshot,
      sessionId: 'sess-m18-sfu-signaling-close',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [{ urls: 'stun:stun.test' }],
    })

    await vi.waitFor(() => {
      const diag = sdk.getDiagnostics()
      expect(diag.drawers.chat.state).toBe('connected')
      expect(diag.drawers.sfuSignaling.state).toBe('connected')
    })

    endSession('signaling_close')

    await vi.waitFor(() => {
      expect(sdk.getDiagnostics().drawers.sfuSignaling.state).toBe('reconnecting')
    })

    const duringOutage = sdk.getDiagnostics()

    expect(chatDisconnect).not.toHaveBeenCalled()
    assertSiblingDrawerStaysConnected(duringOutage, 'chat')
    expect(sdk.getChatStatus()).toBe('open')
    expect(duringOutage.activeErrorCodes).not.toContain('CHAT_SEND_DROPPED')
  })

  // Cross-drawer isolation table: `regression: single-plane reconnecting lifecycle never calls cross-drawer disconnect`
  it('regression: pre-fix SFU enabled gate on chat ws open would block bootstrap (guards #200/#202)', async () => {
    mockSfuConnectOpensImmediately()
    const sfuConnect = vi.mocked(SfuMediaSession.prototype.connect)
    vi.spyOn(ChatSession.prototype, 'connect').mockImplementation(function (this: ChatSession) {
      ;(this as unknown as { setStatus: (status: string) => void }).setStatus('connecting')
      ;(this as unknown as { setLifecycleState: (status: string) => void }).setLifecycleState(
        'reconnecting',
      )
    })

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: harnessBaseSnapshot,
      sessionId: 'sess-m18-enabled-gate-regression',
      wsUrl: 'wss://ws.test',
      apiBaseUrl: 'https://api.test',
      getIceServers: async () => [{ urls: 'stun:stun.test' }],
    })

    await vi.waitFor(() => expect(sfuConnect).toHaveBeenCalled())

    expect(sdk.getDiagnostics().drawers.chat.state).toBe('reconnecting')
    expect(sdk.getDiagnostics().drawers.sfuSignaling.state).not.toBe('torn-down')
    expect(sfuConnect).toHaveBeenCalledTimes(1)
  })
})
