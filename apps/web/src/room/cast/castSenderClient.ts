import { RIFFSYNC_CAST_NAMESPACE } from './castChannelProtocol'

export type CastSenderSessionHandle = {
  sendMessage: (message: unknown) => Promise<void>
  addMessageListener: (handler: (message: unknown) => void) => () => void
  addSessionEndedListener: (handler: () => void) => () => void
  hasActiveRoute: () => boolean
  end: () => Promise<void>
}

export type CastSenderClient = {
  requestSession: () => Promise<CastSenderSessionHandle>
}

export type CastSenderClientFactory = () => CastSenderClient

const CAST_FRAMEWORK_SRC = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
const CAST_FRAMEWORK_SCRIPT_SELECTOR = 'script[data-riffsync-cast-framework="true"]'
const CAST_FRAMEWORK_READY_TIMEOUT_MS = 5000

type CastFrameworkWindow = Window & {
  chrome?: {
    cast?: {
      AutoJoinPolicy?: {
        ORIGIN_SCOPED?: string
      }
    }
  }
  cast?: {
    framework?: {
      CastContext: {
        getInstance: () => CastContextInstance
      }
      CastContextEventType: {
        CAST_STATE_CHANGED: string
        SESSION_STATE_CHANGED: string
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
  requestSession: () => Promise<unknown>
  getCurrentSession: () => CastSessionInstance | null
  addEventListener: (type: string, handler: (event: { sessionState?: string; castState?: string }) => void) => void
  removeEventListener: (type: string, handler: (event: { sessionState?: string; castState?: string }) => void) => void
}

type CastSessionInstance = {
  sendMessage: (namespace: string, message: unknown) => Promise<void>
  addMessageListener: (namespace: string, handler: (namespace: string, message: string) => void) => void
  removeMessageListener: (namespace: string, handler: (namespace: string, message: string) => void) => void
  endSession: (stopCasting?: boolean) => void
  getSessionObj?: () => { appId?: string }
  getApplicationMetadata?: () => { applicationId?: string }
}

type CastFramework = NonNullable<NonNullable<CastFrameworkWindow['cast']>['framework']>

function readCastFramework(): CastFrameworkWindow['cast'] | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as CastFrameworkWindow).cast
}

function readOriginScopedAutoJoinPolicy(): string {
  const policy = (window as CastFrameworkWindow).chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED
  if (!policy) throw new Error('Cast auto join policy unavailable')
  return policy
}

function configureCastContext(cast: NonNullable<CastFrameworkWindow['cast']>): {
  context: CastContextInstance
  framework: CastFramework
  receiverApplicationId: string
} {
  const receiverApplicationId = getCastReceiverApplicationId()
  if (!receiverApplicationId) {
    throw new Error('Cast receiver application id is not configured')
  }
  const framework = cast.framework!
  const context = framework.CastContext.getInstance()
  context.setOptions({
    receiverApplicationId,
    autoJoinPolicy: readOriginScopedAutoJoinPolicy(),
  })
  return { context, framework, receiverApplicationId }
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

    ensureCastFrameworkScript()
  })
}

function wrapCastSession(
  session: CastSessionInstance,
  context: CastContextInstance,
  framework: CastFramework,
): CastSenderSessionHandle {
  const listeners = new Set<(message: unknown) => void>()
  const sessionEndedListeners = new Set<() => void>()
  let activeRoute = true

  const frameworkListener = (_namespace: string, message: string) => {
    try {
      const parsed = JSON.parse(message) as unknown
      for (const listener of listeners) listener(parsed)
    } catch {
      /* Ignore malformed receiver messages. */
    }
  }

  session.addMessageListener(RIFFSYNC_CAST_NAMESPACE, frameworkListener)

  const sessionStateListener = (event: { sessionState?: string }) => {
    if (event.sessionState !== framework.SessionState.SESSION_ENDED) return
    if (!activeRoute) return
    activeRoute = false
    for (const listener of sessionEndedListeners) listener()
  }

  context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, sessionStateListener)

  return {
    sendMessage: async (message) => {
      await session.sendMessage(RIFFSYNC_CAST_NAMESPACE, message)
    },
    addMessageListener: (handler) => {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
    addSessionEndedListener: (handler) => {
      sessionEndedListeners.add(handler)
      return () => sessionEndedListeners.delete(handler)
    },
    hasActiveRoute: () => activeRoute,
    end: async () => {
      session.removeMessageListener(RIFFSYNC_CAST_NAMESPACE, frameworkListener)
      context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, sessionStateListener)
      activeRoute = false
      session.endSession(true)
    },
  }
}

function readCastSessionApplicationId(session: CastSessionInstance): string | null {
  const sessionObjAppId = session.getSessionObj?.().appId?.trim()
  if (sessionObjAppId) return sessionObjAppId

  const metadataApplicationId = session.getApplicationMetadata?.().applicationId?.trim()
  return metadataApplicationId || null
}

function validateCastSessionApplicationId(
  session: CastSessionInstance,
  receiverApplicationId: string,
): void {
  const actualApplicationId = readCastSessionApplicationId(session)
  if (actualApplicationId === receiverApplicationId) return

  if (!actualApplicationId) {
    console.error('[RiffSync Cast] session application id unavailable after start', {
      expectedApplicationId: receiverApplicationId,
    })
    throw new Error('Cast session application id unavailable after start')
  }
  console.error('[RiffSync Cast] session application id mismatch after start', {
    expectedApplicationId: receiverApplicationId,
    actualApplicationId,
  })
  throw new Error('Cast session application id mismatch after start')
}

// Google Cast receiver application ids are 8-character hex strings (e.g. "77E78672").
// Validating the shape catches build-time corruption (for example an unquoted YAML
// scientific-notation literal like `77E78672` overflowing to `Infinity`) before it is
// ever handed to CastContext.setOptions, where a garbage-but-truthy id would silently
// report zero compatible Cast devices instead of a clear configuration error.
const CAST_RECEIVER_APPLICATION_ID_PATTERN = /^[0-9A-F]{8}$/i

export function getCastReceiverApplicationId(): string | null {
  const configured = import.meta.env.VITE_CAST_RECEIVER_APP_ID?.trim()
  if (!configured) return null
  if (!CAST_RECEIVER_APPLICATION_ID_PATTERN.test(configured)) {
    console.error('[RiffSync Cast] configured receiver application id is not a valid Cast application id', {
      configured,
    })
    return null
  }
  return configured
}

export async function prepareDefaultCastSenderClient(): Promise<boolean> {
  try {
    const cast = await waitForCastFramework()
    configureCastContext(cast)
    return true
  } catch {
    return false
  }
}

export function createDefaultCastSenderClient(): CastSenderClient {
  return {
    requestSession: () => {
      const cast = readCastFramework()
      if (!cast?.framework) {
        throw new Error('Cast framework unavailable')
      }
      const receiverApplicationId = getCastReceiverApplicationId()
      if (!receiverApplicationId) {
        throw new Error('Cast receiver application id is not configured')
      }
      const framework = cast.framework
      const context = framework.CastContext.getInstance()

      return new Promise<CastSenderSessionHandle>((resolve, reject) => {
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
          .then(() => {
            if (settled) return
            const session = context.getCurrentSession()
            if (!session) {
              settled = true
              context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged)
              console.error('[RiffSync Cast] context.getCurrentSession() returned null after requestSession resolved')
              reject(new Error('Cast session unavailable after start'))
              return
            }
            try {
              validateCastSessionApplicationId(session, receiverApplicationId)
            } catch (error) {
              settled = true
              context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged)
              reject(error instanceof Error ? error : new Error('Cast session validation failed'))
              return
            }
            settled = true
            context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged)
            console.info('[RiffSync Cast] requestSession resolved', {
              receiverApplicationId,
              sessionAppId: readCastSessionApplicationId(session),
            })
            resolve(wrapCastSession(session, context, framework))
          })
          .catch((rawReason: unknown) => {
            if (settled) return
            settled = true
            context.removeEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, onSessionStateChanged)
            console.error('[RiffSync Cast] requestSession rejected', rawReason)
            reject(new Error('Cast session request failed', { cause: rawReason }))
          })
      })
    },
  }
}
