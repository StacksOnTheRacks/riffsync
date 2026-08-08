// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultCastSenderClient, prepareDefaultCastSenderClient } from './castSenderClient'

type CastSenderTestWindow = Window & {
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
        getInstance: () => {
          setOptions: ReturnType<typeof vi.fn>
          requestSession: ReturnType<typeof vi.fn>
          getCurrentSession: ReturnType<typeof vi.fn>
          addEventListener: ReturnType<typeof vi.fn>
          removeEventListener: ReturnType<typeof vi.fn>
        }
      }
      CastContextEventType: {
        SESSION_STATE_CHANGED: string
      }
      SessionState: {
        SESSION_ENDED: string
      }
      CastState: {
        NO_DEVICES_AVAILABLE: string
      }
    }
  }
}

function installCastFramework({
  includeAutoJoinPolicy = true,
  sessionApplicationId = '77E78672',
}: {
  includeAutoJoinPolicy?: boolean
  sessionApplicationId?: string | null
} = {}) {
  const session = {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    addMessageListener: vi.fn(),
    removeMessageListener: vi.fn(),
    endSession: vi.fn(),
    getSessionObj: vi.fn(() => (sessionApplicationId ? { appId: sessionApplicationId } : {})),
  }
  const currentSession = { value: session as typeof session | null }
  const context = {
    setOptions: vi.fn(),
    requestSession: vi.fn().mockResolvedValue(undefined),
    getCurrentSession: vi.fn(() => currentSession.value),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const win = window as CastSenderTestWindow
  win.chrome = {
    cast: includeAutoJoinPolicy
      ? {
          AutoJoinPolicy: {
            ORIGIN_SCOPED: 'origin_scoped',
          },
        }
      : {},
  }
  win.cast = {
    framework: {
      CastContext: {
        getInstance: () => context,
      },
      CastContextEventType: {
        SESSION_STATE_CHANGED: 'session_state_changed',
      },
      SessionState: {
        SESSION_ENDED: 'session_ended',
      },
      CastState: {
        NO_DEVICES_AVAILABLE: 'no_devices_available',
      },
    },
  }

  return { context, currentSession, session }
}

describe('prepareDefaultCastSenderClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    document.head.innerHTML = ''
    delete (window as CastSenderTestWindow).chrome
    delete (window as CastSenderTestWindow).cast
    delete (window as Window & { __onGCastApiAvailable?: (isAvailable: boolean) => void }).__onGCastApiAvailable
  })

  it('configures CastContext for availability without requesting a session', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77E78672')
    const { context } = installCastFramework()

    await expect(prepareDefaultCastSenderClient()).resolves.toBe(true)

    expect(context.setOptions).toHaveBeenCalledWith({
      receiverApplicationId: '77E78672',
      autoJoinPolicy: 'origin_scoped',
    })
    expect(context.requestSession).not.toHaveBeenCalled()
  })

  it('returns false when the receiver application id is missing', async () => {
    installCastFramework()

    await expect(prepareDefaultCastSenderClient()).resolves.toBe(false)
  })

  it('returns false when the receiver application id is not a valid Cast application id', async () => {
    // Regression coverage for a real production incident: an unquoted `77E78672`
    // in deploy-prod.yml's workflow YAML parsed as scientific-notation float,
    // overflowed to Infinity, and shipped the literal string "Infinity" as the
    // Cast receiver application id in the production bundle.
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'Infinity')
    const { context } = installCastFramework()

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(prepareDefaultCastSenderClient()).resolves.toBe(false)
    expect(context.setOptions).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[RiffSync Cast] configured receiver application id is not a valid Cast application id',
      { configured: 'Infinity' },
    )

    consoleErrorSpy.mockRestore()
  })

  it('returns false when CastContext configuration fails', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77E78672')
    const { context } = installCastFramework({ includeAutoJoinPolicy: false })

    await expect(prepareDefaultCastSenderClient()).resolves.toBe(false)
    expect(context.requestSession).not.toHaveBeenCalled()
  })
})

describe('createDefaultCastSenderClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    delete (window as CastSenderTestWindow).chrome
    delete (window as CastSenderTestWindow).cast
  })

  it('reuses the CastContext configured during availability probing without calling setOptions again', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77E78672')
    const { context } = installCastFramework()

    await expect(prepareDefaultCastSenderClient()).resolves.toBe(true)
    expect(context.setOptions).toHaveBeenCalledTimes(1)

    await createDefaultCastSenderClient().requestSession()

    expect(context.setOptions).toHaveBeenCalledTimes(1)
    expect(context.requestSession).toHaveBeenCalled()
    expect(context.getCurrentSession).toHaveBeenCalled()
  })

  it('requests the Cast session synchronously for the user gesture', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77E78672')
    const { context } = installCastFramework()

    const promise = createDefaultCastSenderClient().requestSession()

    expect(context.requestSession).toHaveBeenCalled()
    await promise
  })

  it('fails before requesting a session when the receiver application id is not configured', async () => {
    const { context } = installCastFramework()

    expect(() => createDefaultCastSenderClient().requestSession()).toThrow(
      'Cast receiver application id is not configured',
    )
    expect(context.requestSession).not.toHaveBeenCalled()
    expect(context.setOptions).not.toHaveBeenCalled()
  })

  it('fails before requesting a session when the receiver application id is not a valid Cast application id', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'Infinity')
    const { context } = installCastFramework()

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => createDefaultCastSenderClient().requestSession()).toThrow(
      'Cast receiver application id is not configured',
    )
    expect(context.requestSession).not.toHaveBeenCalled()
    expect(context.setOptions).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('accepts a lowercase hex receiver application id', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77e78672')
    const { context } = installCastFramework({ sessionApplicationId: '77e78672' })

    await createDefaultCastSenderClient().requestSession()

    expect(context.requestSession).toHaveBeenCalled()
  })

  it('delivers receiver messages sent as object payloads', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77E78672')
    const { session } = installCastFramework()
    const handle = await createDefaultCastSenderClient().requestSession()
    const handler = vi.fn()
    handle.addMessageListener(handler)

    const frameworkListener = session.addMessageListener.mock.calls[0]?.[1]
    frameworkListener?.('urn:x-cast:com.riffsync.presentation', {
      type: 'render_failed',
      reason: 'transport_disconnected',
    })

    expect(handler).toHaveBeenCalledWith({
      type: 'render_failed',
      reason: 'transport_disconnected',
    })
  })

  it('fails when Cast start completes without an active session', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77E78672')
    const { context, currentSession } = installCastFramework()
    currentSession.value = null

    await expect(createDefaultCastSenderClient().requestSession()).rejects.toThrow(
      'Cast session unavailable after start',
    )
    expect(context.requestSession).toHaveBeenCalled()
  })

  it('rejects a resolved session for a different receiver application id', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77E78672')
    const { context, session } = installCastFramework({ sessionApplicationId: 'default-media-receiver' })

    await expect(createDefaultCastSenderClient().requestSession()).rejects.toThrow(
      'Cast session application id mismatch after start',
    )
    expect(context.requestSession).toHaveBeenCalled()
    expect(session.addMessageListener).not.toHaveBeenCalled()
  })

  it('rejects a resolved session when the receiver application id cannot be read', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', '77E78672')
    const { session } = installCastFramework({ sessionApplicationId: null })

    await expect(createDefaultCastSenderClient().requestSession()).rejects.toThrow(
      'Cast session application id unavailable after start',
    )
    expect(session.addMessageListener).not.toHaveBeenCalled()
  })
})
