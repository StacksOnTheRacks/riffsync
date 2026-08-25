import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import { SfuTokenHttpError } from '../av/participantAvErrors'
import { connectSfuUnifiedSession, type SfuConsumerTrackEvent, type SfuMediaErrorCode, type SfuSessionEndReason } from '../sfu/mediasoupSharing'
import { createParticipantAvController } from '../sfu/participantAvSession'
import { LOCAL_SFU_UNREACHABLE_MSG } from '../sfu/sfuConfigErrors'
import { nextSfuReconnectDelayMs } from '../sfu/sfuReconnectPolicy'
import { SFU_DEGRADED_AFTER_FAILED_CYCLES, SFU_JWT_REMINT_LEAD_SECONDS, sfuLifecycleAfterFailedCycle } from './drawerReconnectPolicy'
import { resolveJwtRemintDelayMs } from './sfuJwtRemintSchedule'
import {
  formatSfuTokenError,
  isRosterConsistency403,
  resolveSfuTokenProducerClass,
  SfuMediaSession,
  startSfuRoomSession,
} from './SfuMediaSession'
import * as clientDrawerLog from '../clientDrawerLog'
import * as googleAnalytics from '../../config/googleAnalytics'

vi.mock('../clientDrawerLog', () => ({
  emitClientDrawerLog: vi.fn(),
}))

vi.mock('../../config/googleAnalytics', () => ({
  trackGaEvent: vi.fn(),
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

  it('#205 regression: signaling_close preserves toggles and syncPublish re-publishes after re-attach', async () => {
    vi.useFakeTimers()

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
    vi.stubGlobal(
      'MediaStream',
      function MockMediaStream(
        this: { tracks: MediaStreamTrack[]; getTracks: () => MediaStreamTrack[] },
        tracks: MediaStreamTrack[] = [],
      ) {
        this.tracks = tracks
        this.getTracks = () => this.tracks
      },
    )

    const publishStreamFirst = vi.fn().mockResolvedValue(undefined)
    const publishStreamSecond = vi.fn().mockResolvedValue(undefined)
    let connectCall = 0
    let resolveFirstSessionEnded: ((reason: SfuSessionEndReason) => void) | undefined

    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'producer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => {
      connectCall += 1
      if (connectCall === 1) {
        return {
          ...mockSfuUnifiedSessionHandle(),
          ready: Promise.resolve(),
          sessionEnded: new Promise<SfuSessionEndReason>((resolve) => {
            resolveFirstSessionEnded = resolve
          }),
          supportsPublish: true,
          publishStream: publishStreamFirst,
        } as Awaited<ReturnType<typeof connectSfuUnifiedSession>>
      }
      return {
        ...mockSfuUnifiedSessionHandle(),
        ready: Promise.resolve(),
        sessionEnded: new Promise<SfuSessionEndReason>(() => {}),
        supportsPublish: true,
        publishStream: publishStreamSecond,
      } as Awaited<ReturnType<typeof connectSfuUnifiedSession>>
    })

    const participantAv = createParticipantAvController({ canPublish: () => true })
    await participantAv.enableCamera()
    await participantAv.enableMic()

    const { cancel } = startSfuRoomSession({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-205-reconnect',
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
      expect(publishStreamFirst).toHaveBeenCalled()
    })
    expect(participantAv.getState()).toMatchObject({
      cameraEnabled: true,
      micEnabled: true,
      needsProducerToken: true,
    })

    resolveFirstSessionEnded?.('signaling_close')
    await vi.advanceTimersByTimeAsync(nextSfuReconnectDelayMs(0) + 50)

    await vi.waitFor(() => {
      expect(publishStreamSecond).toHaveBeenCalled()
    })
    expect(participantAv.getState()).toMatchObject({
      cameraEnabled: true,
      micEnabled: true,
      needsProducerToken: true,
    })
    expect(participantAv.getState().error).toBeNull()

    cancel()
  })

  it('calls resetOnReconnect instead of failPublish on recoverable signaling_close', async () => {
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'producer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => ({
      ...mockSfuUnifiedSessionHandle(),
      sessionEnded: Promise.resolve('signaling_close'),
      supportsPublish: true,
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
      ...mockSfuUnifiedSessionHandle(),
      sessionEnded: Promise.resolve('jwt_expired' as SfuSessionEndReason),
      supportsPublish: true,
      tokenRole: 'producer',
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

  it('does not failPublish on transient produce_failed during producer-token reconnect', async () => {
    const videoTrack = { kind: 'video', readyState: 'live', stop: vi.fn(), id: 'v1' }
    const stream = {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [],
      getTracks: () => [videoTrack],
      removeTrack: vi.fn(),
    } as unknown as MediaStream

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    })
    vi.stubGlobal(
      'MediaStream',
      function MockMediaStream(
        this: { tracks: MediaStreamTrack[]; getTracks: () => MediaStreamTrack[] },
        tracks: MediaStreamTrack[] = [],
      ) {
        this.tracks = tracks
        this.getTracks = () => this.tracks
      },
    )

    vi.mocked(fetchSfuJoinToken).mockImplementation(async (opts) => ({
      token: 'tok',
      role: opts.producerClass ? 'producer' : 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
    }))
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async (opts) => {
      if (opts.tokenRole === 'producer') {
        opts.onMediaError?.('produce_failed', 'createWebRtcTransport failed')
        return {
          ...mockSfuUnifiedSessionHandle(),
          ready: Promise.reject(new Error('send_transport_failed')),
          sessionEnded: Promise.resolve('signaling_close'),
          supportsPublish: true,
        } as Awaited<ReturnType<typeof connectSfuUnifiedSession>>
      }
      return mockSfuUnifiedSessionHandle()
    })

    const session = new SfuMediaSession()
    const failPublish = vi.spyOn(session.participantAv, 'failPublish')
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-transient-produce',
      accessToken: 'fan-jwt',
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })
    session.updatePublishGate({ fanToken: 'fan-jwt', avDisabled: false })

    await vi.waitFor(() => expect(session.getStatus()).toBe('open'))
    await session.participantAv.enableCamera()

    await vi.waitFor(() => {
      expect(failPublish).not.toHaveBeenCalled()
    })
    expect(session.participantAv.getState().cameraEnabled).toBe(true)
    expect(session.participantAv.getState().error).toBeNull()

    session.disconnect()
    vi.unstubAllGlobals()
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

describe('SfuMediaSession publish gate', () => {
  it('updatePublishGate keeps connectOptions.accessToken in sync with fanToken', () => {
    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-gate',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: false,
    })

    session.updatePublishGate({ fanToken: 'fan-jwt', avDisabled: false })

    const opts = (
      session as unknown as { connectOptions: { accessToken: string | null } | null }
    ).connectOptions
    expect(opts?.accessToken).toBe('fan-jwt')
    expect(session.participantAv.getState().canPublish).toBe(true)
  })
})

describe('SfuMediaSession signaling drawer logs', () => {
  beforeEach(() => {
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits signaling_connect on reconnect loop start', async () => {
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => mockSfuUnifiedSessionHandle())

    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-log',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => {
      expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
        drawer: 'signaling',
        event: 'signaling_connect',
        outcome: 'retry',
      })
    })

    session.disconnect()
  })

  it('emits signaling_close and signaling_reconnect_scheduled when session ends', async () => {
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => ({
      ...mockSfuUnifiedSessionHandle(),
      sessionEnded: Promise.resolve('signaling_close'),
    }))

    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-close-log',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => {
      expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
        drawer: 'signaling',
        event: 'signaling_close',
        outcome: 'retry',
        severity: 'warn',
      })
    })
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'signaling',
      event: 'signaling_reconnect_scheduled',
      outcome: 'retry',
    })

    session.disconnect()
  })

  it('emits signaling_reconnect_success after a prior failed cycle', async () => {
    let connectCall = 0
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => {
      connectCall += 1
      if (connectCall === 1) {
        return {
          ...mockSfuUnifiedSessionHandle(),
          sessionEnded: Promise.resolve('signaling_close'),
        }
      }
      return mockSfuUnifiedSessionHandle()
    })

    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-recover-log',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => connectCall >= 2)
    await vi.waitFor(() => {
      expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
        drawer: 'signaling',
        event: 'signaling_reconnect_success',
        outcome: 'recovered',
      })
    })

    session.disconnect()
  })

  it('emits token_denied on JWT remint failure', async () => {
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
      sessionId: 'sess-token-log',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => expect(session.getLifecycleState()).toBe('connected'))
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()

    await (
      session as unknown as { remintJoinToken: () => Promise<void> }
    ).remintJoinToken()

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'signaling',
      event: 'token_denied',
      code: 'SFU_TOKEN_DENIED',
      outcome: 'failed',
    })

    session.disconnect()
  })

  it('uses signaling drawer label, not chat', async () => {
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async () => ({
      ...mockSfuUnifiedSessionHandle(),
      sessionEnded: Promise.resolve('signaling_close'),
    }))

    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-drawer-label',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    await vi.waitFor(() => {
      expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalled()
    })

    for (const call of vi.mocked(clientDrawerLog.emitClientDrawerLog).mock.calls) {
      expect(call[0]?.drawer).toBe('signaling')
    }

    session.disconnect()
  })
})

describe('SfuMediaSession produce/consume drawer logs', () => {
  let capturedOnConsumerTrack: ((event: SfuConsumerTrackEvent) => void) | undefined
  let capturedOnMediaError: ((code: SfuMediaErrorCode, message: string) => void) | undefined

  beforeEach(() => {
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
    capturedOnConsumerTrack = undefined
    capturedOnMediaError = undefined
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'tok',
      role: 'consumer',
      wsUrl: 'ws://127.0.0.1:3000',
    })
    vi.mocked(connectSfuUnifiedSession).mockImplementation(async (opts) => {
      capturedOnConsumerTrack = opts.onConsumerTrack
      capturedOnMediaError = opts.onMediaError
      return mockSfuUnifiedSessionHandle()
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  async function connectSession(): Promise<SfuMediaSession> {
    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-produce-consume',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })
    await vi.waitFor(() => expect(capturedOnConsumerTrack).toBeDefined())
    return session
  }

  it('emits producer_closed at INFO when participant_av video consumer detaches', async () => {
    const session = await connectSession()
    const track = { id: 'v1' } as MediaStreamTrack

    capturedOnConsumerTrack?.({
      action: 'attach',
      producerId: 'tile-1',
      producerClass: 'participant_av',
      kind: 'video',
      track,
    })
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
    capturedOnConsumerTrack?.({ action: 'detach', producerId: 'tile-1' })

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'producer_closed',
      code: 'PRODUCER_CLOSED',
      outcome: 'failed',
      severity: 'info',
    })

    session.disconnect()
  })

  it('does not emit producer_closed for host_screen or audio-only detach', async () => {
    const session = await connectSession()
    const track = { id: 'a1' } as MediaStreamTrack

    capturedOnConsumerTrack?.({
      action: 'attach',
      producerId: 'host-1',
      producerClass: 'host_screen',
      kind: 'video',
      track,
    })
    capturedOnConsumerTrack?.({
      action: 'attach',
      producerId: 'mic-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track,
    })
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
    capturedOnConsumerTrack?.({ action: 'detach', producerId: 'host-1' })
    capturedOnConsumerTrack?.({ action: 'detach', producerId: 'mic-1' })

    const produceConsumeCalls = vi
      .mocked(clientDrawerLog.emitClientDrawerLog)
      .mock.calls.filter((call) => call[0]?.drawer === 'produce_consume')
    expect(produceConsumeCalls).toHaveLength(0)

    session.disconnect()
  })

  it('emits transport_limit and consumer_limit on cap failures', async () => {
    const session = await connectSession()
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()

    capturedOnMediaError?.('produce_failed', 'transport limit reached')
    capturedOnMediaError?.('consume_failed', 'consumer limit reached')

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'transport_limit',
      code: 'TRANSPORT_LIMIT_REACHED',
      outcome: 'failed',
    })
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'consumer_limit',
      code: 'CONSUMER_LIMIT_REACHED',
      outcome: 'failed',
    })

    session.disconnect()
  })

  it('emits consumer_attach_failed for non-limit consume errors', async () => {
    const session = await connectSession()
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()

    capturedOnMediaError?.('consume_failed', 'consume failed on device')

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'consumer_attach_failed',
      outcome: 'failed',
    })

    session.disconnect()
  })
})

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

  it('#247 regression: participant camera-off does not disconnect or touch host_screen', async () => {
    const session = new SfuMediaSession()
    const unpublishProducerKind = vi.fn()
    const unpublishProducerClass = vi.fn()
    const detachConsumerClass = vi.fn()
    const close = vi.fn()
    const mockHandle = {
      ...mockSfuUnifiedSessionHandle(),
      unpublishProducerKind,
      unpublishProducerClass,
      detachConsumerClass,
      close,
      supportsPublish: true,
    }
    attachMockSessionHandle(session, mockHandle)
    session.participantAv.attachSession(mockHandle)

    const disconnect = vi.spyOn(session, 'disconnect')
    const unpublishHostScreen = vi.spyOn(session, 'unpublishHostScreen')
    const detachHostScreen = vi.spyOn(session, 'detachHostScreenConsumers')

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [{ kind: 'video', stop: vi.fn(), id: 'v1' }],
          getAudioTracks: () => [{ kind: 'audio', stop: vi.fn(), id: 'a1' }],
          getTracks: () => [
            { kind: 'video', stop: vi.fn(), id: 'v1' },
            { kind: 'audio', stop: vi.fn(), id: 'a1' },
          ],
          removeTrack: vi.fn(),
        }),
      },
    })
    vi.stubGlobal(
      'MediaStream',
      function MockMediaStream(this: { tracks: MediaStreamTrack[] }, tracks: MediaStreamTrack[] = []) {
        this.tracks = tracks
      },
    )

    session.updatePublishGate({ fanToken: 'fan-jwt', avDisabled: false })
    await session.participantAv.enableCamera()
    await session.participantAv.enableMic()

    unpublishProducerKind.mockClear()
    unpublishProducerClass.mockClear()

    session.participantAv.disableCamera()

    expect(unpublishProducerKind).toHaveBeenCalledWith('participant_av', 'video')
    expect(unpublishProducerClass).not.toHaveBeenCalledWith('host_screen')
    expect(disconnect).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(unpublishHostScreen).not.toHaveBeenCalled()
    expect(detachHostScreen).not.toHaveBeenCalled()
    expect(detachConsumerClass).not.toHaveBeenCalledWith('host_screen')
    vi.unstubAllGlobals()
  })

  it('#247 regression: participant mic-off does not disconnect or touch host_screen', async () => {
    const session = new SfuMediaSession()
    const unpublishProducerKind = vi.fn()
    const unpublishProducerClass = vi.fn()
    const detachConsumerClass = vi.fn()
    const close = vi.fn()
    const mockHandle = {
      ...mockSfuUnifiedSessionHandle(),
      unpublishProducerKind,
      unpublishProducerClass,
      detachConsumerClass,
      close,
      supportsPublish: true,
      publishStream: vi.fn().mockResolvedValue(undefined),
    }
    attachMockSessionHandle(session, mockHandle)
    session.participantAv.attachSession(mockHandle)

    const disconnect = vi.spyOn(session, 'disconnect')
    const unpublishHostScreen = vi.spyOn(session, 'unpublishHostScreen')

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [{ kind: 'video', stop: vi.fn(), id: 'v1' }],
          getAudioTracks: () => [{ kind: 'audio', stop: vi.fn(), id: 'a1' }],
          getTracks: () => [
            { kind: 'video', stop: vi.fn(), id: 'v1' },
            { kind: 'audio', stop: vi.fn(), id: 'a1' },
          ],
          removeTrack: vi.fn(),
        }),
      },
    })
    vi.stubGlobal(
      'MediaStream',
      function MockMediaStream(this: { tracks: MediaStreamTrack[] }, tracks: MediaStreamTrack[] = []) {
        this.tracks = tracks
      },
    )

    session.updatePublishGate({ fanToken: 'fan-jwt', avDisabled: false })
    await session.participantAv.enableCamera()
    await session.participantAv.enableMic()

    unpublishProducerKind.mockClear()

    session.participantAv.disableMic()

    expect(unpublishProducerKind).toHaveBeenCalledWith('participant_av', 'audio')
    expect(disconnect).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(unpublishHostScreen).not.toHaveBeenCalled()
    expect(detachConsumerClass).not.toHaveBeenCalledWith('host_screen')
    vi.unstubAllGlobals()
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
    publishStream: vi.fn().mockResolvedValue(undefined),
    supportsPublish: false,
    tokenRole: 'consumer' as const,
    getProducerCount: () => 0,
    getConsumerCount: () => 0,
    hasProducerClass: () => false,
    hasConsumerClass: () => false,
    detachConsumerClass: vi.fn(),
    pauseProducerKind: vi.fn(),
    resumeProducerKind: vi.fn(),
    replayConsumerTracks: vi.fn(),
  }
}

describe('SfuMediaSession GA4 host_broadcast_start', () => {
  beforeEach(() => {
    vi.mocked(googleAnalytics.trackGaEvent).mockClear()
  })

  it('fires host_broadcast_start once after host_screen publish succeeds', async () => {
    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'sess-host',
      accessToken: 'host-token',
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: true,
    })

    const publishStream = vi.fn().mockResolvedValue(undefined)
    attachMockSessionHandle(session, {
      detachConsumerClass: vi.fn(),
      unpublishProducerClass: vi.fn(),
    })
    ;(
      session as unknown as { sessionHandle: { publishStream: typeof publishStream; ready: Promise<void> } }
    ).sessionHandle = {
      publishStream,
      ready: Promise.resolve(),
      unpublishProducerClass: vi.fn(),
    }

    const videoTrack = { kind: 'video', readyState: 'live' } as MediaStreamTrack
    const stream = {
      getTracks: () => [videoTrack],
    } as MediaStream

    session.syncHostScreenPublish({
      stream,
      roomMode: 'theater',
      isPublisher: true,
    })

    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalledWith(stream, 'host_screen')
    })
    expect(googleAnalytics.trackGaEvent).toHaveBeenCalledTimes(1)
    expect(googleAnalytics.trackGaEvent).toHaveBeenCalledWith('host_broadcast_start', {
      is_authenticated: true,
    })

    session.syncHostScreenPublish({
      stream,
      roomMode: 'theater',
      isPublisher: true,
    })
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalledTimes(2)
    })
    expect(googleAnalytics.trackGaEvent).toHaveBeenCalledTimes(1)

    session.disconnect()
  })
})

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

describe('SfuMediaSession participant producer registry (#248)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('tracks remote participant_av producers from signaling lifecycle', () => {
    const session = new SfuMediaSession()
    const changes: number[] = []
    session.onParticipantProducerRegistryChange(() => changes.push(changes.length + 1))

    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'self',
      accessToken: 'fan-jwt',
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: false,
    })

    ;(
      session as unknown as { applySignalingProducerLifecycle: (event: unknown) => void }
    ).applySignalingProducerLifecycle({
      action: 'opened',
      producerId: 'p-v',
      sessionId: 'remote-1',
      producerClass: 'participant_av',
      kind: 'video',
    })

    expect(session.getParticipantProducerSnapshot('remote-1')).toEqual({
      hasVideoProducer: true,
      hasAudioProducer: false,
      audioPaused: false,
    })
    expect(changes.length).toBe(1)

    ;(
      session as unknown as { applySignalingProducerLifecycle: (event: unknown) => void }
    ).applySignalingProducerLifecycle({
      action: 'closed',
      producerId: 'p-v',
      sessionId: 'remote-1',
      producerClass: 'participant_av',
      kind: 'video',
    })

    expect(session.getParticipantProducerSnapshot('remote-1')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: false,
      audioPaused: false,
    })
  })

  it('uses local participant AV state for own sessionId', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [],
          getAudioTracks: () => [{ kind: 'audio', stop: vi.fn(), id: 'a1', enabled: true }],
          getTracks: () => [{ kind: 'audio', stop: vi.fn(), id: 'a1', enabled: true }],
          removeTrack: vi.fn(),
        }),
      },
    })

    const session = new SfuMediaSession()
    session.updatePublishGate({ fanToken: 'fan-jwt', avDisabled: false })
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'self',
      accessToken: 'fan-jwt',
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: false,
    })

    await session.participantAv.enableMic()
    session.participantAv.attachSession({
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
      unpublishProducerClass: vi.fn(),
      unpublishProducerKind: vi.fn(),
    } as unknown as import('../sfu/mediasoupSharing').SfuUnifiedSessionHandle)
    session.participantAv.toggleMicMute()

    expect(session.getParticipantProducerSnapshot('self')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: true,
      audioPaused: true,
    })
  })

  it('clears registry on av kill switch and disconnect', () => {
    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'self',
      accessToken: 'fan-jwt',
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: false,
    })

    ;(
      session as unknown as { applySignalingProducerLifecycle: (event: unknown) => void }
    ).applySignalingProducerLifecycle({
      action: 'opened',
      producerId: 'p-a',
      sessionId: 'remote-2',
      producerClass: 'participant_av',
      kind: 'audio',
    })

    session.handleAvDisabledKillSwitch()
    expect(session.getParticipantProducerSnapshot('remote-2')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: false,
      audioPaused: false,
    })

    session.disconnect()
    expect(session.getParticipantProducerSnapshot('self')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: false,
      audioPaused: false,
    })
  })

  it('marks remote audio paused from consumer pause events', () => {
    const session = new SfuMediaSession()
    session.connect({
      apiBaseUrl: 'https://api.example.test',
      roomId: 'room-1',
      sessionId: 'self',
      accessToken: null,
      getIceServers: async () => [],
      getHostScreenStream: () => null,
      enabled: false,
    })

    ;(
      session as unknown as { applySignalingProducerLifecycle: (event: unknown) => void }
    ).applySignalingProducerLifecycle({
      action: 'opened',
      producerId: 'p-a',
      sessionId: 'remote-3',
      producerClass: 'participant_av',
      kind: 'audio',
    })

    ;(
      session as unknown as { dispatchConsumerTrack: (event: unknown) => void }
    ).dispatchConsumerTrack({
      action: 'pause',
      producerId: 'p-a',
      sessionId: 'remote-3',
      producerClass: 'participant_av',
      kind: 'audio',
    })

    expect(session.getParticipantProducerSnapshot('remote-3')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: true,
      audioPaused: true,
    })
  })
})
