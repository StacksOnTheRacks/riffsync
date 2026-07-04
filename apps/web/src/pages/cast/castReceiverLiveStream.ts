import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import { fetchRtcIceServers } from '../../config/fetchRtcIceServers'
import type { CastLivePlaybackConfig } from '../../room/cast/castChannelProtocol'
import {
  connectSfuUnifiedSession,
  resolveSfuWsBaseForToken,
  type SfuUnifiedSessionHandle,
} from '../../room/sfu/mediasoupSharing'

export type CastReceiverLiveStreamSession = {
  close: () => void
}

export async function startCastReceiverLiveStream(options: {
  livePlayback: CastLivePlaybackConfig
  onRemoteStream: (stream: MediaStream | null) => void
  onPlaybackUnavailable: () => void
}): Promise<CastReceiverLiveStreamSession> {
  const token = await fetchSfuJoinToken({
    apiBaseUrl: options.livePlayback.apiBaseUrl,
    roomId: options.livePlayback.roomId,
    sessionId: options.livePlayback.sessionId,
    accessToken: null,
  })
  const wsBaseUrl = resolveSfuWsBaseForToken(token)
  if (!wsBaseUrl) {
    throw new Error('Cast receiver SFU websocket URL unavailable')
  }

  const session: SfuUnifiedSessionHandle = await connectSfuUnifiedSession({
    wsBaseUrl,
    token: token.token,
    tokenRole: token.role,
    getIceServers: fetchRtcIceServers,
    onRemoteStream: options.onRemoteStream,
    onMediaError: () => options.onPlaybackUnavailable(),
  })
  await session.ready

  return {
    close: () => session.close('user_close'),
  }
}
