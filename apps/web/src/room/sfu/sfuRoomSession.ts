import { fetchSfuJoinToken } from '../../api/webrtcSfuApi'
import {
  connectSfuConsumer,
  connectSfuProducer,
  resolveSfuWsBaseForToken,
  type SfuMediaErrorCode,
  type SfuSessionEndReason,
} from './mediasoupSharing'
import { nextSfuReconnectDelayMs, sleepMs } from './sfuReconnectPolicy'

export type SfuRoomSessionHandle = { close: (reason?: SfuSessionEndReason) => void }

type SessionHooks = {
  assignSession: (session: SfuRoomSessionHandle | null) => void
  onMissingWsUrl: () => void
  onTokenError: (message: string) => void
  onMediaError: (code: SfuMediaErrorCode, message: string) => void
  onSessionClean?: () => void
  /** Clears UI errors when a new SFU connection attempt is about to start. */
  onConnecting?: () => void
}

type ProducerSessionOpts = SessionHooks & {
  role: 'producer'
  apiBaseUrl: string | undefined
  roomId: string
  sessionId: string
  accessToken: string | null
  captureStream: MediaStream
  getIceServers: () => Promise<RTCIceServer[]>
}

type ConsumerSessionOpts = SessionHooks & {
  role: 'consumer'
  apiBaseUrl: string | undefined
  roomId: string
  sessionId: string
  getIceServers: () => Promise<RTCIceServer[]>
  onRemoteStream: (stream: MediaStream | null) => void
}

export type StartSfuRoomSessionOpts = ProducerSessionOpts | ConsumerSessionOpts

function formatSfuTokenError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('sfu-token 403')) {
    return 'Video relay denied access. Open chat on this page first (wait until connected), then try again. If this persists, refresh or sign in again.'
  }
  return msg
}

async function sleepBackoffMs(ms: number, signal: AbortSignal): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end && !signal.aborted) {
    const slice = Math.min(400, end - Date.now())
    if (slice <= 0) break
    await sleepMs(slice)
  }
}

/**
 * Runs refetch-token + SFU connect in a loop until **`user_close`** or **`cancel()`**.
 * **`assignSession`** receives a handle whenever a new SFU connection is up (replace ref each reconnect).
 */
export function startSfuRoomSession(opts: StartSfuRoomSessionOpts): { cancel: () => void } {
  const ac = new AbortController()
  const { signal } = ac
  const { assignSession } = opts
  let attempt = 0
  let activeClose: (() => void) | null = null

  const cancel = () => {
    ac.abort()
    activeClose?.()
    activeClose = null
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

      let tok
      try {
        tok = await fetchSfuJoinToken({
          apiBaseUrl: api,
          roomId,
          sessionId: opts.sessionId,
          accessToken: opts.role === 'producer' ? opts.accessToken : null,
        })
      } catch (e) {
        if (signal.aborted) break
        opts.onTokenError(formatSfuTokenError(e))
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      if (signal.aborted) break
      if (opts.role === 'producer' && tok.role !== 'producer') {
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }
      if (opts.role === 'consumer' && tok.role !== 'consumer') {
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

      if (opts.role === 'producer') {
        const { close, sessionEnded } = await connectSfuProducer({
          wsBaseUrl: wsBase,
          token: tok.token,
          captureStream: opts.captureStream,
          getIceServers: opts.getIceServers,
          onMediaError: opts.onMediaError,
        })
        if (signal.aborted) {
          close()
          break
        }
        activeClose = () => close()
        assignSession({ close })
        const reason = await sessionEnded
        activeClose = null
        assignSession(null)
        opts.onSessionClean?.()
        if (reason === 'user_close' || signal.aborted) break
        await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
        continue
      }

      const { close, sessionEnded } = await connectSfuConsumer({
        wsBaseUrl: wsBase,
        token: tok.token,
        getIceServers: opts.getIceServers,
        onRemoteStream: opts.onRemoteStream,
        onMediaError: opts.onMediaError,
      })
      if (signal.aborted) {
        close()
        break
      }
      activeClose = () => close()
      assignSession({ close })
      const reason = await sessionEnded
      activeClose = null
      assignSession(null)
      opts.onSessionClean?.()
      if (reason === 'user_close' || signal.aborted) break
      await sleepBackoffMs(nextSfuReconnectDelayMs(attempt++), signal)
    }
  })()

  return { cancel }
}
