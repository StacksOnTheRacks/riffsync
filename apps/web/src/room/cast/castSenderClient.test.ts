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
}: {
  includeAutoJoinPolicy?: boolean
} = {}) {
  const session = {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    addMessageListener: vi.fn(),
    removeMessageListener: vi.fn(),
    endSession: vi.fn(),
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
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'receiver-app-id')
    const { context } = installCastFramework()

    await expect(prepareDefaultCastSenderClient()).resolves.toBe(true)

    expect(context.setOptions).toHaveBeenCalledWith({
      receiverApplicationId: 'receiver-app-id',
      autoJoinPolicy: 'origin_scoped',
    })
    expect(context.requestSession).not.toHaveBeenCalled()
  })

  it('returns false when the receiver application id is missing', async () => {
    installCastFramework()

    await expect(prepareDefaultCastSenderClient()).resolves.toBe(false)
  })

  it('returns false when CastContext configuration fails', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'receiver-app-id')
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

  it('configures CastContext with the Base API auto-join policy', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'receiver-app-id')
    const { context } = installCastFramework()

    await createDefaultCastSenderClient().requestSession()

    expect(context.setOptions).toHaveBeenCalledWith({
      receiverApplicationId: 'receiver-app-id',
      autoJoinPolicy: 'origin_scoped',
    })
    expect(context.requestSession).toHaveBeenCalled()
    expect(context.getCurrentSession).toHaveBeenCalled()
  })

  it('requests the Cast session synchronously for the user gesture', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'receiver-app-id')
    const { context } = installCastFramework()

    const promise = createDefaultCastSenderClient().requestSession()

    expect(context.requestSession).toHaveBeenCalled()
    await promise
  })

  it('fails before requesting a session when the Cast Base API policy is unavailable', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'receiver-app-id')
    const { context } = installCastFramework({ includeAutoJoinPolicy: false })

    expect(() => createDefaultCastSenderClient().requestSession()).toThrow(
      'Cast auto join policy unavailable',
    )
    expect(context.requestSession).not.toHaveBeenCalled()
  })

  it('fails when Cast start completes without an active session', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'receiver-app-id')
    const { context, currentSession } = installCastFramework()
    currentSession.value = null

    await expect(createDefaultCastSenderClient().requestSession()).rejects.toThrow(
      'Cast session unavailable after start',
    )
    expect(context.requestSession).toHaveBeenCalled()
  })
})
