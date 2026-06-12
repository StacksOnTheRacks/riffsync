import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import { SfuTokenHttpError } from '../av/participantAvErrors'
import { connectSfuUnifiedSession } from './mediasoupSharing'
import {
  formatSfuTokenError,
  isRosterConsistency403,
  resolveSfuTokenProducerClass,
  startSfuRoomSession,
} from './sfuRoomSession'
import { createParticipantAvController } from './participantAvSession'
import { LOCAL_SFU_UNREACHABLE_MSG } from './sfuConfigErrors'

vi.mock('../../api/webrtcSfuApi', () => ({
  fetchSfuJoinToken: vi.fn(),
}))

vi.mock('./mediasoupSharing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mediasoupSharing')>()
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
