import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import {
  isParticipantAvTokenHardFail,
  participantAvErrorFromSfuSessionEnd,
  participantAvErrorFromSfuTokenDenial,
  SfuTokenHttpError,
} from '../av/participantAvErrors'
import {
  connectSfuUnifiedSession,
  resolveSfuWsBaseForToken,
  type SfuConsumerTrackEvent,
  type SfuMediaErrorCode,
  type SfuProducerClass,
  type SfuUnifiedSessionHandle,
} from './mediasoupSharing'
import type { ParticipantAvController } from './participantAvSession'
import { nextSfuReconnectDelayMs, sleepMs } from './sfuReconnectPolicy'

export type SfuRoomSessionHandle = SfuUnifiedSessionHandle

type SessionHooks = {
  assignSession: (session: SfuRoomSessionHandle | null) => void
  onMissingWsUrl: () => void
  onTokenError: (message: string) => void
  onMediaError: (code: SfuMediaErrorCode, message: string) => void
  onSessionClean?: () => void
  onConnecting?: () => void
}

export type StartSfuRoomSessionOpts = SessionHooks & {
  apiBaseUrl: string | undefined
  roomId: string
  sessionId: string
  accessToken: string | null
  getIceServers: () => Promise<RTCIceServer[]>
  onRemoteStream: (stream: MediaStream | null) => void
  onConsumerTrack?: (event: SfuConsumerTrackEvent) => void
  getHostScreenStream: () => MediaStream | null
  participantAv: ParticipantAvController
}

export function formatSfuTokenError(e: unknown): string {
  if (e instanceof SfuTokenHttpError) {
    const fromApi = e.apiError?.trim()
    if (fromApi) {
      return `Video relay denied access. ${fromApi} If this persists, wait until the room shows connected, refresh, or sign in again.`
    }
  }
  const msg = e instanceof Error ? e.message : String(e)
  const m403 = /^sfu-token 403:\s*(.+)$/s.exec(msg)
  if (m403) {
    const fromApi = m403[1].trim()
    if (fromApi)
      return `Video relay denied access. ${fromApi} If this persists, wait until the room shows connected, refresh, or sign in again.`
  }
  return msg
}

function routeParticipantAvTokenDenial(
  participantAv: ParticipantAvController,
  producerClass: SfuProducerClass | undefined,
  e: unknown,
): boolean {
  if (producerClass !== 'participant_av') return false
  if (!(e instanceof SfuTokenHttpError)) return false
  const avCode = participantAvErrorFromSfuTokenDenial(e.status, e.code)
  if (!avCode) return false
  participantAv.failPublish(avCode)
  return isParticipantAvTokenHardFail(e.code)
}

/** Transient: WS is open but Dynamo roster GSI has not caught up yet (`webrtc-sfu-token` 403). */
export function isRosterConsistency403(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return (
    /sfu-token\s+403:/i.test(msg) &&
    /open the room websocket first|unknown session for this room/i.test(msg)
  )
}

export function resolveSfuTokenProducerClass(opts: {
  participantAv: ParticipantAvController
  getHostScreenStream: () => MediaStream | null
}): SfuProducerClass | undefined {
  const hostStream = opts.getHostScreenStream()
  if (hostStream?.getTracks().some((track) => track.readyState === 'live')) {
    return 'host_screen'
  }
  if (opts.participantAv.getState().needsProducerToken) {
    return 'participant_av'
  }
  return undefined
}

async function sleepBackoffMs(ms: number, signal: AbortSignal): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end && !signal.aborted) {
    const slice = Math.min(400, end - Date.now())
    if (slice <= 0) break
    await sleepMs(slice)
  }
}

async function publishHostScreenIfNeeded(
  session: SfuUnifiedSessionHandle,
  getHostScreenStream: () => MediaStream | null,
  onMediaError: (code: SfuMediaErrorCode, message: string) => void,
): Promise<void> {
  const stream = getHostScreenStream()
  const live = stream?.getTracks().some((track) => track.readyState === 'live') ?? false
  if (!live || !stream) {
    session.unpublishProducerClass('host_screen')
    return
  }
  try {
    await session.ready
    await session.publishStream(stream, 'host_screen')
  } catch (e) {
    onMediaError(
      'produce_failed',
      e instanceof Error ? e.message : 'Failed to publish host screen to relay.',
    )
  }
}

/**
 * One SFU WebSocket per tab: shared consumers plus optional host_screen / participant_av producers.
 */
export function startSfuRoomSession(opts: StartSfuRoomSessionOpts): { cancel: () => void } {
  const ac = new AbortController()
  const { signal } = ac
  const { assignSession, participantAv } = opts
  let attempt = 0
  let activeClose: (() => void) | null = null

  const cancel = () => {
    ac.abort()
    activeClose?.()
    activeClose = null
    participantAv.attachSession(null)
    assignSession(null)
    opts.onSessionClean?.()
  }

  void (async () => {
    while (!signal.aborted) {
      const api = opts.apiBaseUrl
      const roomId = opts.roomId
      if (!api || !roomId) {
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      const producerClass = resolveSfuTokenProducerClass({
        participantAv,
        getHostScreenStream: opts.getHostScreenStream,
      })

      let tok
      try {
        tok = await fetchSfuJoinToken({
          apiBaseUrl: api,
          roomId,
          sessionId: opts.sessionId,
          accessToken: opts.accessToken,
          ...(producerClass ? { producerClass } : {}),
        })
      } catch (e) {
        if (signal.aborted) break
        const hardFail = routeParticipantAvTokenDenial(participantAv, producerClass, e)
        const rosterRace = isRosterConsistency403(e)
        if (!hardFail && (!rosterRace || attempt >= 4)) {
          opts.onTokenError(formatSfuTokenError(e))
        }
        const delayMs = hardFail
          ? nextSfuReconnectDelayMs(attempt)
          : rosterRace
            ? Math.min(2500, 200 + 350 * Math.max(0, attempt))
            : nextSfuReconnectDelayMs(attempt)
        await sleepBackoffMs(delayMs, signal)
        attempt++
        continue
      }

      if (signal.aborted) break

      const wantsProducer = producerClass !== undefined
      if (wantsProducer && tok.role !== 'producer') {
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }
      if (!wantsProducer && tok.role !== 'consumer') {
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      const wsBase = resolveSfuWsBaseForToken(tok)
      if (!wsBase) {
        opts.onMissingWsUrl()
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      attempt = 0
      opts.onConnecting?.()

      const session = await connectSfuUnifiedSession({
        wsBaseUrl: wsBase,
        token: tok.token,
        tokenRole: tok.role,
        getIceServers: opts.getIceServers,
        onRemoteStream: opts.onRemoteStream,
        onConsumerTrack: opts.onConsumerTrack,
        ownSessionId: opts.sessionId,
        onMediaError: opts.onMediaError,
      })

      if (signal.aborted) {
        session.close()
        break
      }

      activeClose = () => session.close()
      assignSession(session)
      participantAv.attachSession(session)
      await publishHostScreenIfNeeded(session, opts.getHostScreenStream, opts.onMediaError)

      const reason = await session.sessionEnded
      activeClose = null
      participantAv.attachSession(null)
      assignSession(null)
      opts.onSessionClean?.()
      if (reason === 'user_close' || signal.aborted) break
      const hadPublishIntent = participantAv.getState().needsProducerToken
      const sessionErr = participantAvErrorFromSfuSessionEnd(reason, {
        hadPublishIntent,
        reconnectAttempts: attempt,
      })
      if (sessionErr) {
        participantAv.failPublish(sessionErr)
      } else {
        participantAv.resetOnReconnect()
      }
      await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
    }
  })()

  return { cancel }
}
