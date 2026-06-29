import type { CastPresentationSnapshot, CastStartLifecycle } from './castChannelProtocol'
import { parseCastReceiverOutboundMessage } from './castChannelProtocol'
import type { CastSenderClient, CastSenderSessionHandle } from './castSenderClient'

export const CAST_RENDER_CONFIRMATION_TIMEOUT_MS = 15000

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
  confirmationTimeoutMs?: number
}

export function createCastStartController({
  client,
  confirmationTimeoutMs = CAST_RENDER_CONFIRMATION_TIMEOUT_MS,
}: CreateCastStartControllerOptions): CastStartController {
  let lifecycle: CastStartLifecycle = 'idle'
  let session: CastSenderSessionHandle | null = null
  let removeMessageListener: (() => void) | null = null
  let confirmationTimer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<(state: CastStartControllerState) => void>()

  const emit = () => {
    const state = { lifecycle }
    for (const listener of listeners) listener(state)
  }

  const clearConfirmationTimer = () => {
    if (confirmationTimer !== null) {
      clearTimeout(confirmationTimer)
      confirmationTimer = null
    }
  }

  const cleanupSession = async () => {
    clearConfirmationTimer()
    removeMessageListener?.()
    removeMessageListener = null
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
    await cleanupSession()
    lifecycle = 'start_failed'
    emit()
  }

  const confirmStart = () => {
    clearConfirmationTimer()
    lifecycle = 'casting'
    emit()
  }

  return {
    getState: () => ({ lifecycle }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    startCast: async (snapshot) => {
      if (lifecycle === 'starting' || lifecycle === 'casting') return

      lifecycle = 'starting'
      emit()

      try {
        const nextSession = await client.requestSession()
        session = nextSession

        removeMessageListener = nextSession.addMessageListener((raw) => {
          const message = parseCastReceiverOutboundMessage(raw)
          if (!message) return
          if (message.type === 'render_confirmed') {
            confirmStart()
            return
          }
          if (message.type === 'render_failed') {
            void failStart()
          }
        })

        confirmationTimer = setTimeout(() => {
          void failStart()
        }, confirmationTimeoutMs)

        await nextSession.sendMessage({
          type: 'presentation_snapshot',
          snapshot,
        })
      } catch {
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
        /* Receiver disconnect handling belongs to later slices. */
      }
    },
    resetStartFailure: () => {
      if (lifecycle !== 'start_failed') return
      lifecycle = 'idle'
      emit()
    },
    stopCast: async () => {
      if (lifecycle === 'idle' || lifecycle === 'starting' || lifecycle === 'start_failed') return
      if (lifecycle === 'stopping') return

      lifecycle = 'stopping'
      emit()

      await cleanupSession()
      lifecycle = 'idle'
      emit()
    },
  }
}
