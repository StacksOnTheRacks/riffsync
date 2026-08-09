import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import { fetchRtcIceServers } from '../../config/fetchRtcIceServers'
import { SfuTokenHttpError } from '../../room/av/participantAvErrors'
import type { CastLivePlaybackConfig } from '../../room/cast/castChannelProtocol'
import {
  connectSfuUnifiedSession,
  resolveSfuWsBaseForToken,
  type SfuMediaErrorCode,
  type SfuSessionEndReason,
  type SfuUnifiedSessionHandle,
} from '../../room/sfu/mediasoupSharing'

export type CastReceiverLiveStreamSession = {
  close: () => void
}

export type CastReceiverLiveStreamFailureReason =
  | 'sfu_token_denied'
  | 'sfu_signaling_failed'
  | 'ice_failed'
  | 'transport_disconnected'
  | 'consume_failed'
  | 'bad_capabilities'
  | 'sfu_relay_url_missing'
  | 'receiver_live_stream_failed'

export class CastReceiverLiveStreamError extends Error {
  readonly reason: CastReceiverLiveStreamFailureReason

  constructor(reason: CastReceiverLiveStreamFailureReason, cause?: unknown) {
    super(`Cast receiver live stream failed: ${reason}`)
    this.name = 'CastReceiverLiveStreamError'
    this.reason = reason
    if (cause) this.cause = cause
  }
}

export function mapCastReceiverSfuErrorToReason(
  code: SfuMediaErrorCode,
): CastReceiverLiveStreamFailureReason {
  if (code === 'missing_ws_url' || code === 'local_sfu_unreachable' || code === 'sfu_relay_unreachable') {
    return 'sfu_relay_url_missing'
  }
  if (code === 'signaling_failed' || code === 'signaling_closed') {
    return 'sfu_signaling_failed'
  }
  if (code === 'transport_failed') {
    return 'ice_failed'
  }
  if (code === 'transport_stalled') {
    return 'transport_disconnected'
  }
  if (code === 'consume_failed') {
    return 'consume_failed'
  }
  if (code === 'bad_capabilities') {
    return 'bad_capabilities'
  }
  return 'receiver_live_stream_failed'
}

export function mapCastReceiverSfuSessionEndToReason(
  reason: SfuSessionEndReason,
): CastReceiverLiveStreamFailureReason | null {
  if (reason === 'user_close') return null
  if (reason === 'transport_failed') return 'ice_failed'
  if (reason === 'transport_disconnected_timeout') return 'transport_disconnected'
  return 'sfu_signaling_failed'
}

export function castReceiverLiveStreamFailureReasonFromError(
  error: unknown,
): CastReceiverLiveStreamFailureReason {
  if (error instanceof CastReceiverLiveStreamError) return error.reason
  if (error instanceof SfuTokenHttpError) return 'sfu_token_denied'
  return 'receiver_live_stream_failed'
}

export async function startCastReceiverLiveStream(options: {
  livePlayback: CastLivePlaybackConfig
  onRemoteStream: (stream: MediaStream | null) => void
  onPlaybackUnavailable: (reason: CastReceiverLiveStreamFailureReason) => void
}): Promise<CastReceiverLiveStreamSession> {
  let token: Awaited<ReturnType<typeof fetchSfuJoinToken>>
  try {
    token = await fetchSfuJoinToken({
      apiBaseUrl: options.livePlayback.apiBaseUrl,
      roomId: options.livePlayback.roomId,
      sessionId: options.livePlayback.sessionId,
      accessToken: null,
    })
  } catch (error) {
    throw new CastReceiverLiveStreamError(
      castReceiverLiveStreamFailureReasonFromError(error),
      error,
    )
  }
  const wsBaseUrl = resolveSfuWsBaseForToken(token)
  if (!wsBaseUrl) {
    throw new CastReceiverLiveStreamError('sfu_relay_url_missing')
  }

  let lastFailureReason: CastReceiverLiveStreamFailureReason | null = null
  const session: SfuUnifiedSessionHandle = await connectSfuUnifiedSession({
    wsBaseUrl,
    token: token.token,
    tokenRole: token.role,
    getIceServers: fetchRtcIceServers,
    // Match guest ICE policy; do not force TURN relay on TV-only.
    onRemoteStream: options.onRemoteStream,
    onMediaError: (code) => {
      lastFailureReason = mapCastReceiverSfuErrorToReason(code)
      options.onPlaybackUnavailable(lastFailureReason)
    },
  })
  try {
    await session.ready
  } catch (error) {
    throw new CastReceiverLiveStreamError(lastFailureReason ?? 'receiver_live_stream_failed', error)
  }

  void session.sessionEnded.then((reason) => {
    const failureReason = mapCastReceiverSfuSessionEndToReason(reason)
    if (failureReason) options.onPlaybackUnavailable(failureReason)
  })

  return {
    close: () => session.close('user_close'),
  }
}
