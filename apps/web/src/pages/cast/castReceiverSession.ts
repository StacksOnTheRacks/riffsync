import type {
  CastChatOverlayLine,
  CastPresentationSnapshot,
  CastSenderOutboundMessage,
} from '../../room/cast/castChannelProtocol'
import { RIFFSYNC_CAST_NAMESPACE } from '../../room/cast/castChannelProtocol'

const CAST_RECEIVER_FRAMEWORK_SRC =
  'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js'

type CastReceiverFrameworkWindow = Window & {
  cast?: {
    framework?: {
      CastReceiverContext: {
        getInstance: () => CastReceiverContextInstance
      }
      CastReceiverOptions: new () => CastReceiverOptions
      system: {
        MessageType: {
          JSON: string
        }
      }
    }
  }
}

type CastReceiverOptions = {
  customNamespaces?: Record<string, string>
}

type CastReceiverContextInstance = {
  start: (options?: CastReceiverOptions) => void
  addCustomMessageListener: (
    namespace: string,
    handler: (event: { data?: unknown; senderId?: string }) => void,
  ) => void
  sendCustomMessage: (namespace: string, senderId: string | undefined, message: unknown) => void
}

let activeReceiverContext: CastReceiverContextInstance | null = null
let activeReceiverSenderId: string | undefined

function parseSenderMessage(raw: unknown): CastSenderOutboundMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const type = (raw as { type?: unknown }).type
  if (type === 'presentation_snapshot') {
    const snapshot = (raw as { snapshot?: unknown }).snapshot
    if (!snapshot || typeof snapshot !== 'object') return null
    return { type: 'presentation_snapshot', snapshot: snapshot as CastPresentationSnapshot }
  }
  if (type === 'chat_overlay_update') {
    const messages = (raw as { messages?: unknown }).messages
    if (!Array.isArray(messages)) return null
    return { type: 'chat_overlay_update', messages: messages as CastChatOverlayLine[] }
  }
  return null
}

function ensureReceiverFrameworkScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Receiver requires a browser document'))
      return
    }

    const existing = document.querySelector('script[data-riffsync-cast-receiver-framework="true"]')
    if (existing) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = CAST_RECEIVER_FRAMEWORK_SRC
    script.async = true
    script.dataset.riffsyncCastReceiverFramework = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Cast receiver framework failed to load'))
    document.head.appendChild(script)
  })
}

export type CastReceiverPresentationHandlers = {
  onPresentationSnapshot: (snapshot: CastPresentationSnapshot) => void
  onChatOverlayUpdate: (messages: CastChatOverlayLine[]) => void
}

export type CastReceiverSession = {
  stop: () => void
}

export async function startCastReceiverSession(
  handlers: CastReceiverPresentationHandlers,
): Promise<CastReceiverSession> {
  await ensureReceiverFrameworkScript()

  const framework = (window as CastReceiverFrameworkWindow).cast?.framework
  if (!framework) {
    throw new Error('Cast receiver framework unavailable')
  }

  const context = framework.CastReceiverContext.getInstance()
  activeReceiverContext = context
  activeReceiverSenderId = undefined

  context.addCustomMessageListener(RIFFSYNC_CAST_NAMESPACE, (event) => {
    activeReceiverSenderId = typeof event.senderId === 'string' ? event.senderId : undefined
    if (!event.data) return
    try {
      const raw = typeof event.data === 'string' ? JSON.parse(event.data) as unknown : event.data
      const message = parseSenderMessage(raw)
      if (!message) return
      if (message.type === 'presentation_snapshot') {
        handlers.onPresentationSnapshot(message.snapshot)
        return
      }
      if (message.type === 'chat_overlay_update') {
        handlers.onChatOverlayUpdate(message.messages)
      }
    } catch {
      /* Ignore malformed sender messages. */
    }
  })

  const options = new framework.CastReceiverOptions()
  options.customNamespaces = {
    [RIFFSYNC_CAST_NAMESPACE]: framework.system.MessageType.JSON,
  }

  context.start(options)

  return {
    stop: () => {
      /* Receiver lifecycle teardown is owned by the Cast runtime. */
    },
  }
}

export function sendCastReceiverRendered(context: CastReceiverContextInstance, snapshotId: string): void {
  context.sendCustomMessage(
    RIFFSYNC_CAST_NAMESPACE,
    activeReceiverSenderId,
    JSON.stringify({
      type: 'receiver_rendered',
      schemaVersion: 1,
      snapshotId,
      stagePrimaryRendered: true,
      chatOverlayRendered: true,
    }),
  )
}

export function sendCastReceiverRenderFailed(
  context: CastReceiverContextInstance,
  reason?: string,
): void {
  context.sendCustomMessage(
    RIFFSYNC_CAST_NAMESPACE,
    activeReceiverSenderId,
    JSON.stringify({ type: 'render_failed', reason }),
  )
}

export function getActiveCastReceiverContext(): CastReceiverContextInstance | null {
  if (activeReceiverContext) return activeReceiverContext
  const framework = (window as CastReceiverFrameworkWindow).cast?.framework
  return framework?.CastReceiverContext.getInstance() ?? null
}

/** @deprecated Use getActiveCastReceiverContext. */
export const getCastReceiverContextForTests = getActiveCastReceiverContext
