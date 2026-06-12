import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import { SfuTokenHttpError } from '../av/participantAvErrors'
import { connectSfuUnifiedSession, type SfuSessionEndReason } from '../sfu/mediasoupSharing'
import { createParticipantAvController } from '../sfu/participantAvSession'
import { LOCAL_SFU_UNREACHABLE_MSG } from '../sfu/sfuConfigErrors'
import { SFU_DEGRADED_AFTER_FAILED_CYCLES, SFU_JWT_REMINT_LEAD_SECONDS, sfuLifecycleAfterFailedCycle } from './drawerReconnectPolicy'
import { resolveJwtRemintDelayMs } from './sfuJwtRemintSchedule'
import {
  formatSfuTokenError,
  isRosterConsistency403,
  resolveSfuTokenProducerClass,
  SfuMediaSession,
  startSfuRoomSession,
} from './SfuMediaSession'

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

describe('formatSfuTokenError', () => {
  it('expands structured SfuTokenHttpError copy', () => {
    const msg = formatSfuTokenError(
      new SfuTokenHttpError(403, {
        code: 'publisher_cap_exceeded',
        error: 'This room has reached the maximum number of live cameras and microphones.',
      }),
    )
    expect(msg).toContain('Video relay denied access.')
    expect(msg).toContain('maximum number of live')
  })

  it('expands roster-related 403 copy', () => {
    const msg = formatSfuTokenError(
      new Error('sfu-token 403: Open the room WebSocket first (unknown session for this room).'),
    )
    expect(msg).toContain('Video relay denied access.')
    expect(msg).toContain('Open the room WebSocket first')
  })
})

describe('isRosterConsistency403', () => {
  it('detects transient roster race errors', () => {
    expect(
      isRosterConsistency403(
        new Error('sfu-token 403: Open the room WebSocket first (unknown session for this room).'),
      ),
    ).toBe(true)
    expect(isRosterConsistency403(new Error('sfu-token 401: expired'))).toBe(false)
  })
})

describe('resolveSfuTokenProducerClass', () => {
  it('returns undefined when no publish intent exists', () => {
    const participantAv = createParticipantAvController({ canPublish: () => true })
    expect(
      resolveSfuTokenProducerClass({
        participantAv,
        getHostScreenStream: () => null,
      }),
    ).toBeUndefined()
  })

  it('requests host_screen when tab capture is live', () => {
    const participantAv = createParticipantAvController({ canPublish: () => true })
    const hostStream = {
      getTracks: () => [{ kind: 'video', readyState: 'live' }],
    } as MediaStream

    expect(
      resolveSfuTokenProducerClass({
        participantAv,
        getHostScreenStream: () => hostStream,
      }),
    ).toBe('host_screen')
  })

  it('prefers host_screen when tab capture and participant AV are both active', () => {
    const participantAv = {
      getState: () => ({
        cameraEnabled: true,
        micEnabled: false,
        micMuted: false,
        canPublish: true,
        needsProducerToken: true,
        error: null,
        busy: false,
      }),
    } as ReturnType<typeof createParticipantAvController>
    const hostStream = {
      getTracks: () => [{ kind: 'video', readyState: 'live' }],
    } as MediaStream

    expect(
      resolveSfuTokenProducerClass({
        participantAv,
        getHostScreenStream: () => hostStream,
      }),
    ).toBe('host_screen')
  })

  it('requests participant_av when only participant publish intent exists', () => {
    const participantAv = {
      getState: () => ({
        cameraEnabled: false,
        micEnabled: true,
        micMuted: false,
        canPublish: true,
        needsProducerToken: true,
        error: null,
        busy: false,
      }),
    } as ReturnType<typeof createParticipantAvController>

    expect(
      resolveSfuTokenProducerClass({
        participantAv,
        getHostScreenStream: () => null,
      }),
    ).toBe('participant_av')
  })
})

describe('startSfuRoomSession recoverable signaling reconnect', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('calls resetOnReconnect instead of failPublish on recoverable signaling_close', async () => {
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'producer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => ({
      ready: Promise.resolve(),
      sessionEnded: Promise.resolve('signaling_close'),
      close: vi.fn(),
      unpublishProducerKind: vi.fn(),
      unpublishProducerClass: vi.fn(),
      publishStream: vi.fn(),
      supportsPublish: true,
      detachConsumerClass: vi.fn(),
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    }))

    const participantAv = {
      getState: () => ({
        cameraEnabled: true,
        micEnabled: false,
        micMuted: false,
        canPublish: true,
        needsProducerToken: true,
        error: null,
        busy: false,
      }),
      attachSession: vi.fn(),
      resetOnReconnect: vi.fn(),
      failPublish: vi.fn(),
    } as unknown as ReturnType<typeof createParticipantAvController>

    const { cancel } = startSfuRoomSession({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-1',
      accessToken: 'fan-jwt',
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      participantAv,
      onRemoteStream: () => {},
      assignSession: () => {},
      onMissingWsUrl: vi.fn(),
      onTokenError: vi.fn(),
      onMediaError: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(participantAv.resetOnReconnect).toHaveBeenCalled()
    })
    expect(participantAv.failPublish).not.toHaveBeenCalled()
    expect(participantAv.attachSession).toHaveBeenCalledWith(null)

    cancel()
  })

  it('failPublish still runs on hard session end while publish intent exists', async () => {
    const participantAv = {
      getState: () => ({
        cameraEnabled: true,
        micEnabled: false,
        micMuted: false,
        canPublish: true,
        needsProducerToken: true,
        error: null,
        busy: false,
      }),
      attachSession: vi.fn(),
      resetOnReconnect: vi.fn(),
      failPublish: vi.fn(),
    } as unknown as ReturnType<typeof createParticipantAvController>

    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'producer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => ({
      ready: Promise.resolve(),
      sessionEnded: Promise.resolve('jwt_expired' as SfuSessionEndReason),
      close: vi.fn(),
      unpublishProducerKind: vi.fn(),
      unpublishProducerClass: vi.fn(),
      publishStream: vi.fn(),
      supportsPublish: true,
      detachConsumerClass: vi.fn(),
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    }))

    const { cancel } = startSfuRoomSession({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-1',
      accessToken: 'fan-jwt',
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      participantAv,
      onRemoteStream: () => {},
      assignSession: () => {},
      onMissingWsUrl: vi.fn(),
      onTokenError: vi.fn(),
      onMediaError: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(participantAv.failPublish).toHaveBeenCalledWith('token_expired')
    })
    expect(participantAv.resetOnReconnect).not.toHaveBeenCalled()

    cancel()
  })
})

describe('startSfuRoomSession config error banner persistence', () => {
  beforeEach(() => {
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    )
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async (opts) => {
      opts.onMediaError?.('signaling_failed', 'Could not connect to video relay (signaling).')
      return {
        ready: Promise.reject(new Error('signaling failed')),
        sessionEnded: Promise.resolve('signaling_close'),
        close: vi.fn(),
        unpublishProducerKind: vi.fn(),
        unpublishProducerClass: vi.fn(),
        publishStream: vi.fn(),
        supportsPublish: false,
        detachConsumerClass: vi.fn(),
        pauseProducerKind: vi.fn(),
        resumeProducerKind: vi.fn(),
      } as unknown as Awaited<ReturnType<typeof connectSfuUnifiedSession>>
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('skips onConnecting after a configuration-class error is active', async () => {
    const onConnecting = vi.fn()
    const onMediaError = vi.fn()
    const participantAv = createParticipantAvController({ canPublish: () => false })

    const { cancel } = startSfuRoomSession({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-1',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      participantAv,
      onRemoteStream: () => {},
      assignSession: () => {},
      onMissingWsUrl: vi.fn(),
      onTokenError: vi.fn(),
      onMediaError,
      onConnecting,
    })

    await vi.waitFor(() => {
      expect(onMediaError).toHaveBeenCalledWith(
        'local_sfu_unreachable',
        LOCAL_SFU_UNREACHABLE_MSG,
      )
    })

    await vi.waitFor(() => {
      expect(onConnecting.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    const connectingCallsAfterConfigError = onConnecting.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(onConnecting.mock.calls.length).toBe(connectingCallsAfterConfigError)

    cancel()
  })
})

function attachMockSessionHandle(
  session: SfuMediaSession,
  handle: {
    detachConsumerClass: ReturnType<typeof vi.fn>
    unpublishProducerClass?: ReturnType<typeof vi.fn>
    close?: ReturnType<typeof vi.fn>
  },
): void {
  ;(
    session as unknown as {
      sessionHandle: typeof handle
    }
  ).sessionHandle = handle
}

describe('SfuMediaSession drawer errors', () => {
  it('emits typed drawer errors for config-class signaling failures', async () => {
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async (opts) => {
      opts.onMediaError?.('signaling_failed', 'Could not connect to video relay (signaling).')
      return {
        ready: Promise.reject(new Error('signaling failed')),
        sessionEnded: Promise.resolve('signaling_close'),
        close: vi.fn(),
        unpublishProducerKind: vi.fn(),
        unpublishProducerClass: vi.fn(),
        publishStream: vi.fn(),
        supportsPublish: false,
        detachConsumerClass: vi.fn(),
        pauseProducerKind: vi.fn(),
        resumeProducerKind: vi.fn(),
      } as unknown as Awaited<ReturnType<typeof connectSfuUnifiedSession>>
    })

    const session = new SfuMediaSession()
    const drawerErrors: Array<{ code: string; drawer: string } | null> = []
    session.onDrawerError((error) => drawerErrors.push(error))

    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-1',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => {
      expect(drawerErrors.some((error) => error?.code === 'LOCAL_SFU_UNREACHABLE')).toBe(true)
    })

    session.disconnect()
    vi.unstubAllGlobals()
  })
})

describe('SfuMediaSession media policy', () => {
  it('handleShareStateStopped detaches host_screen for guests only', () => {
    const session = new SfuMediaSession()
    const detach = vi.fn()
    attachMockSessionHandle(session, { detachConsumerClass: detach })

    const remoteListener = vi.fn()
    session.onRemoteStream(remoteListener)

    session.handleShareStateStopped(true)
    expect(detach).not.toHaveBeenCalled()

    session.handleShareStateStopped(false)
    expect(detach).toHaveBeenCalledWith('host_screen')
    expect(detach).not.toHaveBeenCalledWith('participant_av')
    expect(remoteListener).toHaveBeenCalledWith(null)
  })

  it('share_state started has no symmetric detach — guest theater re-attaches via onRemoteStream (#146)', () => {
    const session = new SfuMediaSession()
    const detach = vi.fn()
    attachMockSessionHandle(session, { detachConsumerClass: detach })

    const remoteListener = vi.fn()
    session.onRemoteStream(remoteListener)

    const hostScreenStream = {
      getTracks: () => [{ kind: 'video', readyState: 'live' }],
      getVideoTracks: () => [{ kind: 'video', readyState: 'live' }],
    } as MediaStream
    ;(
      session as unknown as { emitRemoteStream: (stream: MediaStream | null) => void }
    ).emitRemoteStream(hostScreenStream)

    expect(detach).not.toHaveBeenCalled()
    expect(remoteListener).toHaveBeenCalledWith(hostScreenStream)
    expect(session.getStatus()).not.toBe('closed')
  })

  it('regression: guest share-stop never tears down SFU session or participant AV', () => {
    const session = new SfuMediaSession()
    const detach = vi.fn()
    const close = vi.fn()
    attachMockSessionHandle(session, { detachConsumerClass: detach, close })

    const disconnect = vi.spyOn(session, 'disconnect')
    const killSwitch = vi.spyOn(session, 'handleAvDisabledKillSwitch')
    const teardown = vi.spyOn(session.participantAv, 'teardownPublishing')

    session.handleShareStateStopped(false)

    expect(detach).toHaveBeenCalledWith('host_screen')
    expect(detach).not.toHaveBeenCalledWith('participant_av')
    expect(disconnect).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(killSwitch).not.toHaveBeenCalled()
    expect(teardown).not.toHaveBeenCalled()
  })

  it('unpublishHostScreen closes host_screen producers only', () => {
    const session = new SfuMediaSession()
    const unpublish = vi.fn()
    attachMockSessionHandle(session, { detachConsumerClass: vi.fn(), unpublishProducerClass: unpublish })

    session.unpublishHostScreen()

    expect(unpublish).toHaveBeenCalledWith('host_screen')
    expect(unpublish).not.toHaveBeenCalledWith('participant_av')
  })

  it('handleAvDisabledKillSwitch tears down participant AV', () => {
    const session = new SfuMediaSession()
    const detach = vi.fn()
    const teardown = vi.spyOn(session.participantAv, 'teardownPublishing')
    attachMockSessionHandle(session, { detachConsumerClass: detach })

    const clearListener = vi.fn()
    session.onParticipantAvConsumersClear(clearListener)

    session.handleAvDisabledKillSwitch()
    expect(teardown).toHaveBeenCalled()
    expect(detach).toHaveBeenCalledWith('participant_av')
    expect(clearListener).toHaveBeenCalled()
  })
})

function base64UrlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `header.${base64UrlJson(payload)}.sig`
}

function mockSfuUnifiedSessionHandle() {
  return {
    ready: Promise.resolve(),
    sessionEnded: new Promise<SfuSessionEndReason>(() => {}),
    close: vi.fn(),
    unpublishProducerKind: vi.fn(),
    unpublishProducerClass: vi.fn(),
    publishStream: vi.fn(),
    supportsPublish: false,
    tokenRole: 'consumer' as const,
    getProducerCount: () => 0,
    getConsumerCount: () => 0,
    detachConsumerClass: vi.fn(),
    pauseProducerKind: vi.fn(),
    resumeProducerKind: vi.fn(),
    replayConsumerTracks: vi.fn(),
  }
}

describe('SfuMediaSession lifecycle FSM', () => {
  it('maps failed reconnect cycles to degraded lifecycle at threshold', () => {
    const session = new SfuMediaSession()
    const internal = session as unknown as {
      failedReconnectCycles: number
      enabled: boolean
      tokenIntentGeneration: number
      clearJwtRemintTimer: () => void
      sessionHandle: null
      setStatus: (status: string) => void
      setLifecycleState: (state: string) => void
    }

    internal.enabled = true
    internal.tokenIntentGeneration = 0
    internal.sessionHandle = null

    for (let i = 0; i < SFU_DEGRADED_AFTER_FAILED_CYCLES - 1; i += 1) {
      internal.failedReconnectCycles += 1
      internal.clearJwtRemintTimer()
      const lifecycle = sfuLifecycleAfterFailedCycle(internal.failedReconnectCycles)
      internal.setStatus(lifecycle === 'degraded' ? 'degraded' : 'reconnecting')
      internal.setLifecycleState(lifecycle)
      expect(session.getLifecycleState()).toBe('reconnecting')
    }

    internal.failedReconnectCycles += 1
    const lifecycle = sfuLifecycleAfterFailedCycle(internal.failedReconnectCycles)
    internal.setStatus(lifecycle === 'degraded' ? 'degraded' : 'reconnecting')
    internal.setLifecycleState(lifecycle)
    expect(session.getLifecycleState()).toBe('degraded')
    expect(session.getStatus()).toBe('degraded')
  })
})

describe('SfuMediaSession JWT remint', () => {
  const fixedNowMs = 1_700_000_000_000

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('schedules proactive remint at exp minus lead while signaling is open', async () => {
    const exp = Math.floor(fixedNowMs / 1000) + 900
    const token = fakeJwt({ exp })
    vi.mocked(fetchSfuJoinToken)
      .mockResolvedValueOnce({
        token,
        role: 'consumer',
        wsUrl: 'ws://127.0.0.1:3000',
        expiresInSeconds: 900,
      })
      .mockResolvedValueOnce({
        token: fakeJwt({ exp: exp + 900 }),
        role: 'consumer',
        wsUrl: 'ws://127.0.0.1:3000',
        expiresInSeconds: 900,
      })

    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => mockSfuUnifiedSessionHandle())

    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-jwt',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => expect(session.getLifecycleState()).toBe('connected'))

    const delay = resolveJwtRemintDelayMs(token, 900, fixedNowMs)!
    expect(delay).toBe((900 - SFU_JWT_REMINT_LEAD_SECONDS) * 1000)

    vi.useFakeTimers()
    vi.setSystemTime(fixedNowMs)
    ;(
      session as unknown as { scheduleJwtRemint: (t: string, e?: number) => void }
    ).scheduleJwtRemint(token, 900)
    await vi.advanceTimersByTimeAsync(delay + 1)
    await vi.waitFor(() => expect(vi.mocked(fetchSfuJoinToken).mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(session.getLifecycleState()).toBe('connected')
  })

  it('enters degraded on failed remint without tearing down reconnect loop', async () => {
    const exp = Math.floor(Date.now() / 1000) + 120
    const token = fakeJwt({ exp })
    let fetchCalls = 0
    vi.mocked(fetchSfuJoinToken).mockImplementation(async () => {
      fetchCalls += 1
      if (fetchCalls === 1) {
        return {
          token,
          role: 'consumer' as const,
          wsUrl: 'ws://127.0.0.1:3000',
          expiresInSeconds: 120,
        }
      }
      throw new SfuTokenHttpError(403, { code: 'av_disabled', error: 'denied' })
    })

    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => mockSfuUnifiedSessionHandle())

    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-jwt-fail',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => expect(session.getLifecycleState()).toBe('connected'))

    await (
      session as unknown as { remintJoinToken: () => Promise<void> }
    ).remintJoinToken()

    expect(session.getLifecycleState()).toBe('degraded')
    expect(session.getLastErrorCode()).toBe('SFU_TOKEN_DENIED')
    expect(session.getStatus()).toBe('degraded')
  })

  it('clears JWT remint timer on disconnect', async () => {
    const exp = Math.floor(fixedNowMs / 1000) + 900
    const token = fakeJwt({ exp })
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token,
      role: 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
      expiresInSeconds: 900,
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => mockSfuUnifiedSessionHandle())

    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-teardown',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => expect(session.getLifecycleState()).toBe('connected'))
    const callsBefore = vi.mocked(fetchSfuJoinToken).mock.calls.length
    session.disconnect()

    vi.useFakeTimers()
    vi.setSystemTime(fixedNowMs)
    ;(
      session as unknown as { scheduleJwtRemint: (t: string, e?: number) => void }
    ).scheduleJwtRemint(token, 900)
    await vi.advanceTimersByTimeAsync(900_000)
    expect(vi.mocked(fetchSfuJoinToken).mock.calls.length).toBe(callsBefore)
    expect(session.getLifecycleState()).toBe('torn-down')
  })
})
