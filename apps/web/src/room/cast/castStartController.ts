import type { CastPresentationSnapshot, CastStartLifecycle } from './castChannelProtocol'
import { parseCastReceiverOutboundMessage } from './castChannelProtocol'
import type { CastSenderClient, CastSenderSessionHandle } from './castSenderClient'

export const CAST_LAUNCH_TIMEOUT_MS = 45_000
export const CAST_RENDER_CONFIRMATION_TIMEOUT_MS = 30_000

export type CastStartControllerState = {
  lifecycle: CastStartLifecycle
}

export type CastStartController = {
  getState: () => CastStartControllerState
  subscribe: (listener: (state: CastStartControllerState) => void) => () => void
  startCast: (snapshot: CastPresentationSnapshot) => Promise<void>
  sendChatOverlayUpdate: (snapshot: CastPresentationSnapshot) => Promise<void>
  resetStartFailure: () => void
  stopCast: () => Promise<void>
}

type CreateCastStartControllerOptions = {
  client: CastSenderClient
  launchTimeoutMs?: number
  confirmationTimeoutMs?: number
}

export function createCastStartController({
  client,
  launchTimeoutMs = CAST_LAUNCH_TIMEOUT_MS,
  confirmationTimeoutMs = CAST_RENDER_CONFIRMATION_TIMEOUT_MS,
}: CreateCastStartControllerOptions): CastStartController {
  let lifecycle: CastStartLifecycle = 'idle'
  let session: CastSenderSessionHandle | null = null
  let removeMessageListener: (() => void) | null = null
  let removeSessionEndedListener: (() => void) | null = null
  let launchTimer: ReturnType<typeof setTimeout> | null = null
  let confirmationTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<(state: CastStartControllerState) => void>()

  const emit = () => {
    const state = { lifecycle }
    for (const listener of listeners) listener(state)
  }

  const clearLaunchTimer = () => {
    if (launchTimer !== null) {
      clearTimeout(launchTimer)
      launchTimer = null
    }
  }

  const clearConfirmationTimer = () => {
    if (confirmationTimer !== null) {
      clearTimeout(confirmationTimer)
      confirmationTimer = null
    }
  }

  const detachSessionListeners = () => {
    clearConfirmationTimer()
    removeMessageListener?.()
    removeMessageListener = null
    removeSessionEndedListener?.()
    removeSessionEndedListener = null
  }

  const cleanupSession = async () => {
    detachSessionListeners()
    const activeSession = session
    session = null
    if (activeSession) {
      try {
        await activeSession.end()
      } catch {
        /* Best-effort Cast cleanup. */
      }
    }
  }

  const failStart = async () => {
    clearLaunchTimer()
    await cleanupSession()
    lifecycle = 'start_failed'
    emit()
  }

  const recoverFromActiveSession = async (nextLifecycle: Extract<CastStartLifecycle, 'session_ended' | 'playback_blocked'>) => {
    await cleanupSession()
    lifecycle = nextLifecycle
    emit()
  }

  const confirmStart = () => {
    clearConfirmationTimer()
    lifecycle = 'casting'
    emit()
  }

  const handleReceiverMessage = (raw: unknown) => {
    const message = parseCastReceiverOutboundMessage(raw)
    if (!message) return
    if (message.type === 'render_confirmed') {
      if (lifecycle === 'session_pending_render') confirmStart()
      return
    }
    if (message.type === 'render_failed') {
      if (lifecycle === 'session_pending_render') {
        void failStart()
        return
      }
      if (lifecycle === 'casting' || lifecycle === 'stop_failed') {
        void recoverFromActiveSession('playback_blocked')
      }
    }
  }

  const attachSession = (nextSession: CastSenderSessionHandle) => {
    session = nextSession

    removeMessageListener = nextSession.addMessageListener(handleReceiverMessage)
    removeSessionEndedListener = nextSession.addSessionEndedListener(() => {
      if (lifecycle === 'session_pending_render') {
        void failStart()
        return
      }
      if (lifecycle === 'casting' || lifecycle === 'stopping' || lifecycle === 'stop_failed') {
        void recoverFromActiveSession('session_ended')
      }
    })
  }

  const stopActiveSession = async (): Promise<'idle' | 'session_ended' | 'stop_failed'> => {
    clearConfirmationTimer()
    const activeSession = session
    if (!activeSession) {
      detachSessionListeners()
      return 'session_ended'
    }

    try {
      await activeSession.end()
    } catch {
      if (activeSession.hasActiveRoute()) {
        return 'stop_failed'
      }
      detachSessionListeners()
      session = null
      return 'session_ended'
    }

    detachSessionListeners()
    session = null
    return 'idle'
  }

  return {
    getState: () => ({ lifecycle }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    startCast: async (snapshot) => {
      if (
        lifecycle === 'launching' ||
        lifecycle === 'session_pending_render' ||
        lifecycle === 'casting' ||
        lifecycle === 'stopping' ||
        lifecycle === 'stop_failed'
      ) {
        return
      }

      lifecycle = 'launching'
      emit()

      let launchAbortReject: ((error: Error) => void) | undefined
      const launchAbortPromise = new Promise<never>((_, reject) => {
        launchAbortReject = reject
      })

      launchTimer = setTimeout(() => {
        launchAbortReject?.(new Error('Cast launch timed out'))
      }, launchTimeoutMs)

      try {
        const nextSession = await Promise.race([client.requestSession(), launchAbortPromise])
        clearLaunchTimer()
        if (lifecycle !== 'launching') return

        lifecycle = 'session_pending_render'
        emit()

        attachSession(nextSession)

        confirmationTimer = setTimeout(() => {
          void failStart()
        }, confirmationTimeoutMs)

        await nextSession.sendMessage({
          type: 'presentation_snapshot',
          snapshot,
        })
      } catch {
        clearLaunchTimer()
        if (lifecycle !== 'launching') return
        await failStart()
      }
    },
    sendChatOverlayUpdate: async (snapshot) => {
      if (lifecycle !== 'casting' || !session) return
      try {
        await session.sendMessage({
          type: 'chat_overlay_update',
          messages: snapshot.chatOverlay.messages,
        })
      } catch {
        await recoverFromActiveSession('session_ended')
      }
    },
    resetStartFailure: () => {
      if (lifecycle !== 'start_failed' && lifecycle !== 'session_ended' && lifecycle !== 'playback_blocked') return
      lifecycle = 'idle'
      emit()
    },
    stopCast: async () => {
      if (
        lifecycle === 'idle' ||
        lifecycle === 'launching' ||
        lifecycle === 'session_pending_render' ||
        lifecycle === 'start_failed' ||
        lifecycle === 'session_ended' ||
        lifecycle === 'playback_blocked'
      ) {
        return
      }
      if (lifecycle === 'stopping') return

      lifecycle = 'stopping'
      emit()

      lifecycle = await stopActiveSession()
      emit()
    },
  }
}
