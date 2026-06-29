import { RIFFSYNC_CAST_NAMESPACE } from './castChannelProtocol'

export type CastSenderSessionHandle = {
  sendMessage: (message: unknown) => Promise<void>
  addMessageListener: (handler: (message: unknown) => void) => () => void
  end: () => Promise<void>
}

export type CastSenderClient = {
  requestSession: () => Promise<CastSenderSessionHandle>
}

export type CastSenderClientFactory = () => CastSenderClient

const CAST_FRAMEWORK_SRC = 'https://www.gstatic.com/cast/sdk/libs/sender/1.0/cast_framework.js'
const CAST_FRAMEWORK_SCRIPT_SELECTOR = 'script[data-riffsync-cast-framework="true"]'
const CAST_FRAMEWORK_READY_TIMEOUT_MS = 5000

type CastFrameworkWindow = Window & {
  cast?: {
    framework?: {
      CastContext: {
        getInstance: () => CastContextInstance
      }
      CastContextEventType: {
        CAST_STATE_CHANGED: string
        SESSION_STATE_CHANGED: string
      }
      AutoJoinPolicy: {
        ORIGIN_SCOPED: string
      }
      SessionState: {
        SESSION_STARTED: string
        SESSION_ENDED: string
      }
      CastState: {
        NO_DEVICES_AVAILABLE: string
      }
    }
  }
  __onGCastApiAvailable?: (isAvailable: boolean) => void
}

type CastContextInstance = {
  setOptions: (options: { receiverApplicationId: string; autoJoinPolicy: string }) => void
  requestSession: () => Promise<CastSessionInstance>
  addEventListener: (type: string, handler: (event: { sessionState?: string; castState?: string }) => void) => void
  removeEventListener: (type: string, handler: (event: { sessionState?: string; castState?: string }) => void) => void
}

type CastSessionInstance = {
  sendMessage: (namespace: string, message: unknown) => Promise<void>
  addMessageListener: (namespace: string, handler: (namespace: string, message: string) => void) => void
  removeMessageListener: (namespace: string, handler: (namespace: string, message: string) => void) => void
  endSession: (stopCasting?: boolean) => void
}

function readCastFramework(): CastFrameworkWindow['cast'] | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as CastFrameworkWindow).cast
}

function ensureCastFrameworkScript(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(CAST_FRAMEWORK_SCRIPT_SELECTOR)) return

  const script = document.createElement('script')
  script.src = CAST_FRAMEWORK_SRC
  script.async = true
  script.dataset.riffsyncCastFramework = 'true'
  script.onerror = () => {
    const win = window as CastFrameworkWindow
    win.__onGCastApiAvailable?.(false)
  }
  document.head.appendChild(script)
}

async function waitForCastFramework(): Promise<NonNullable<CastFrameworkWindow['cast']>> {
  const immediate = readCastFramework()?.framework
  if (immediate) return readCastFramework()!

  ensureCastFrameworkScript()

  return await new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('Cast framework load timed out')), CAST_FRAMEWORK_READY_TIMEOUT_MS)
    const win = window as CastFrameworkWindow
    const previousCallback = win.__onGCastApiAvailable

    win.__onGCastApiAvailable = (isAvailable) => {
      window.clearTimeout(timeoutId)
      if (previousCallback && previousCallback !== win.__onGCastApiAvailable) {
        previousCallback(isAvailable)
      }
      if (!isAvailable || !readCastFramework()?.framework) {
        reject(new Error('Cast framework unavailable'))
        return
      }
      resolve(readCastFramework()!)
    }
  })
}

function wrapCastSession(session: CastSessionInstance): CastSenderSessionHandle {
  const listeners = new Set<(message: unknown) => void>()

  const frameworkListener = (_namespace: string, message: string) => {
    try {
      const parsed = JSON.parse(message) as unknown
      for (const listener of listeners) listener(parsed)
    } catch {
      /* Ignore malformed receiver messages. */
    }
  }

  session.addMessageListener(RIFFSYNC_CAST_NAMESPACE, frameworkListener)

  return {
    sendMessage: async (message) => {
      await session.sendMessage(RIFFSYNC_CAST_NAMESPACE, message)
    },
    addMessageListener: (handler) => {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
    end: async () => {
      session.removeMessageListener(RIFFSYNC_CAST_NAMESPACE, frameworkListener)
      session.endSession(true)
    },
  }
}

export function getCastReceiverApplicationId(): string | null {
  const configured = import.meta.env.VITE_CAST_RECEIVER_APP_ID?.trim()
  return configured || null
}

export function createDefaultCastSenderClient(): CastSenderClient {
  return {
    requestSession: async () => {
      const receiverApplicationId = getCastReceiverApplicationId()
      if (!receiverApplicationId) {
        throw new Error('Cast receiver application id is not configured')
      }

      const cast = await waitForCastFramework()
      const framework = cast.framework!
      const context = framework.CastContext.getInstance()
      context.setOptions({
        receiverApplicationId,
        autoJoinPolicy: framework.AutoJoinPolicy.ORIGIN_SCOPED,
      })

      return await new Promise<CastSenderSessionHandle>((resolve, reject) => {
        let settled = false

        const onSessionStateChanged = (event: { sessionState?: string }) => {
          if (event.sessionState === framework.SessionState.SESSION_ENDED && !settled) {
            settled = true
            context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged)
            reject(new Error('Cast session ended before start completed'))
          }
        }

        context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged)

        void context
          .requestSession()
          .then((session) => {
            if (settled) return
            settled = true
            context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged)
            resolve(wrapCastSession(session))
          })
          .catch((error: unknown) => {
            if (settled) return
            settled = true
            context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged)
            reject(error instanceof Error ? error : new Error('Cast session request failed'))
          })
      })
    },
  }
}
