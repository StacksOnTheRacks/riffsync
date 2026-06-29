// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultCastSenderClient } from './castSenderClient'

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
  const context = {
    setOptions: vi.fn(),
    requestSession: vi.fn().mockResolvedValue(session),
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

  return { context, session }
}

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
  })

  it('fails before requesting a session when the Cast Base API policy is unavailable', async () => {
    vi.stubEnv('VITE_CAST_RECEIVER_APP_ID', 'receiver-app-id')
    const { context } = installCastFramework({ includeAutoJoinPolicy: false })

    await expect(createDefaultCastSenderClient().requestSession()).rejects.toThrow(
      'Cast auto join policy unavailable',
    )
    expect(context.requestSession).not.toHaveBeenCalled()
  })
})
