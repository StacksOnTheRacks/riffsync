import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SfuTokenHttpError } from '../../room/av/participantAvErrors'
import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import {
  connectSfuUnifiedSession,
  resolveSfuWsBaseForToken,
  type SfuSessionEndReason,
  type SfuUnifiedSessionHandle,
} from '../../room/sfu/mediasoupSharing'
import {
  castReceiverLiveStreamFailureReasonFromError,
  mapCastReceiverSfuErrorToReason,
  mapCastReceiverSfuSessionEndToReason,
  startCastReceiverLiveStream,
} from './castReceiverLiveStream'

vi.mock('../../api/webrtcSfuApi', () => ({
  fetchSfuJoinToken: vi.fn(),
}))

vi.mock('../../config/fetchRtcIceServers', () => ({
  fetchRtcIceServers: vi.fn().mockResolvedValue([
    {
      urls: 'turn:turn.riffsync.test:3478?transport=udp',
      username: 'user',
      credential: 'secret',
    },
  ]),
}))

vi.mock('../../room/sfu/mediasoupSharing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../room/sfu/mediasoupSharing')>()
  return {
    ...actual,
    connectSfuUnifiedSession: vi.fn(),
    resolveSfuWsBaseForToken: vi.fn(),
  }
})

type ConnectOptions = Parameters<typeof connectSfuUnifiedSession>[0]

const livePlayback = {
  roomId: 'room-1',
  sessionId: 'session-1',
  apiBaseUrl: 'https://api.riffsync.test',
}

function createSession(options: {
  ready?: Promise<void>
  sessionEnded?: Promise<SfuSessionEndReason>
} = {}): SfuUnifiedSessionHandle {
  return {
    ready: options.ready ?? Promise.resolve(),
    sessionEnded: options.sessionEnded ?? new Promise<SfuSessionEndReason>(() => undefined),
    supportsPublish: false,
    tokenRole: 'consumer',
    publishStream: vi.fn(),
    unpublishProducerKind: vi.fn(),
    unpublishProducerClass: vi.fn(),
    pauseProducerKind: vi.fn(),
    resumeProducerKind: vi.fn(),
    replayConsumerTracks: vi.fn(),
    close: vi.fn(),
  } as unknown as SfuUnifiedSessionHandle
}

describe('startCastReceiverLiveStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchSfuJoinToken).mockResolvedValue({
      token: 'token-1',
      role: 'consumer',
      wsUrl: 'wss://signal.riffsync.test',
    })
    vi.mocked(resolveSfuWsBaseForToken).mockReturnValue('wss://signal.riffsync.test')
    vi.mocked(connectSfuUnifiedSession).mockResolvedValue(createSession())
  })

  it('uses guest-equivalent ICE (no TV-only forced relay) on the Cast receiver SFU session', async () => {
    await startCastReceiverLiveStream({
      livePlayback,
      onRemoteStream: vi.fn(),
      onPlaybackUnavailable: vi.fn(),
    })

    expect(connectSfuUnifiedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        wsBaseUrl: 'wss://signal.riffsync.test',
        token: 'token-1',
        tokenRole: 'consumer',
      }),
    )
    const connectOptions = vi.mocked(connectSfuUnifiedSession).mock.calls[0]?.[0] as {
      iceTransportPolicy?: string
    }
    expect(connectOptions.iceTransportPolicy).toBeUndefined()
  })

  it('maps media errors to structured receiver failure reasons', async () => {
    const onPlaybackUnavailable = vi.fn()

    await startCastReceiverLiveStream({
      livePlayback,
      onRemoteStream: vi.fn(),
      onPlaybackUnavailable,
    })

    const connectOptions = vi.mocked(connectSfuUnifiedSession).mock.calls[0]?.[0] as ConnectOptions
    connectOptions.onMediaError?.('transport_failed', 'transport failed')

    expect(onPlaybackUnavailable).toHaveBeenCalledWith('ice_failed')
  })

  it('maps non-user session end reasons to structured receiver failure reasons', async () => {
    let resolveEnded: ((reason: SfuSessionEndReason) => void) | undefined
    const sessionEnded = new Promise<SfuSessionEndReason>((resolve) => {
      resolveEnded = resolve
    })
    vi.mocked(connectSfuUnifiedSession).mockResolvedValue(createSession({ sessionEnded }))
    const onPlaybackUnavailable = vi.fn()

    await startCastReceiverLiveStream({
      livePlayback,
      onRemoteStream: vi.fn(),
      onPlaybackUnavailable,
    })
    resolveEnded?.('transport_disconnected_timeout')
    await Promise.resolve()

    expect(onPlaybackUnavailable).toHaveBeenCalledWith('transport_disconnected')
  })
})

describe('Cast receiver live stream failure reason mapping', () => {
  it('maps SFU media errors to stable Cast receiver reasons', () => {
    expect(mapCastReceiverSfuErrorToReason('transport_failed')).toBe('ice_failed')
    expect(mapCastReceiverSfuErrorToReason('transport_stalled')).toBe('transport_disconnected')
    expect(mapCastReceiverSfuErrorToReason('consume_failed')).toBe('consume_failed')
    expect(mapCastReceiverSfuErrorToReason('bad_capabilities')).toBe('bad_capabilities')
    expect(mapCastReceiverSfuErrorToReason('signaling_failed')).toBe('sfu_signaling_failed')
  })

  it('maps session end reasons to stable Cast receiver reasons', () => {
    expect(mapCastReceiverSfuSessionEndToReason('user_close')).toBeNull()
    expect(mapCastReceiverSfuSessionEndToReason('transport_failed')).toBe('ice_failed')
    expect(mapCastReceiverSfuSessionEndToReason('transport_disconnected_timeout')).toBe(
      'transport_disconnected',
    )
    expect(mapCastReceiverSfuSessionEndToReason('signaling_close')).toBe('sfu_signaling_failed')
  })

  it('maps token denials to sfu_token_denied', () => {
    const error = new SfuTokenHttpError(403, {
      code: 'unknown_session',
      error: 'Open the room WebSocket first.',
    })

    expect(castReceiverLiveStreamFailureReasonFromError(error)).toBe('sfu_token_denied')
  })
})
