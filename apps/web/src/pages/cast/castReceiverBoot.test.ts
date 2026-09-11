// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RIFFSYNC_CAST_NAMESPACE } from '../../room/cast/castChannelProtocol'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const bootSource = readFileSync(resolve(webRoot, 'public/cast-receiver-boot.js'), 'utf8')

type ReceiverMessageHandler = (event: { data?: unknown; senderId?: string }) => void

type CastReceiverBootWindow = Window & {
  __riffsyncCastReceiver?: {
    started: boolean
    context: { start: ReturnType<typeof vi.fn> } | null
    queue: Array<{ data?: unknown; senderId?: string }>
    onMessage: ReceiverMessageHandler | null
  }
  cast?: {
    framework?: {
      CastReceiverContext: {
        getInstance: () => {
          start: ReturnType<typeof vi.fn>
          addCustomMessageListener: ReturnType<typeof vi.fn>
          sendCustomMessage: ReturnType<typeof vi.fn>
        }
      }
      CastReceiverOptions: new () => {
        customNamespaces?: Record<string, string>
        disableIdleTimeout?: boolean
        skipPlayersLoad?: boolean
      }
      system: {
        MessageType: {
          JSON: string
        }
      }
    }
  }
}

function installReceiverFramework() {
  let messageHandler: ReceiverMessageHandler | null = null
  const context = {
    start: vi.fn(),
    addCustomMessageListener: vi.fn((namespace: string, handler: ReceiverMessageHandler) => {
      if (namespace === RIFFSYNC_CAST_NAMESPACE) messageHandler = handler
    }),
    sendCustomMessage: vi.fn(),
  }

  ;(window as CastReceiverBootWindow).cast = {
    framework: {
      CastReceiverContext: {
        getInstance: () => context,
      },
      CastReceiverOptions: class {
        customNamespaces?: Record<string, string>
        disableIdleTimeout?: boolean
        skipPlayersLoad?: boolean
      },
      system: {
        MessageType: {
          JSON: 'json',
        },
      },
    },
  }

  return {
    context,
    emitMessage: (data: unknown, senderId = 'sender-1') => {
      messageHandler?.({ data, senderId })
    },
  }
}

describe('public/cast-receiver-boot.js', () => {
  afterEach(() => {
    delete (window as CastReceiverBootWindow).cast
    delete (window as CastReceiverBootWindow).__riffsyncCastReceiver
  })

  it('starts CAF from a classic script before any module evaluates', () => {
    const receiver = installReceiverFramework()

    // eslint-disable-next-line no-new-func
    new Function(bootSource)()

    const boot = (window as CastReceiverBootWindow).__riffsyncCastReceiver
    expect(boot?.started).toBe(true)
    expect(boot?.context).toBe(receiver.context)
    expect(receiver.context.addCustomMessageListener).toHaveBeenCalledWith(
      RIFFSYNC_CAST_NAMESPACE,
      expect.any(Function),
    )
    expect(receiver.context.start).toHaveBeenCalledWith(
      expect.objectContaining({
        customNamespaces: {
          [RIFFSYNC_CAST_NAMESPACE]: 'json',
        },
        disableIdleTimeout: true,
        skipPlayersLoad: true,
      }),
    )
    expect(receiver.context.addCustomMessageListener.mock.invocationCallOrder[0]).toBeLessThan(
      receiver.context.start.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    )
  })

  it('queues sender messages until the module attaches onMessage', () => {
    const receiver = installReceiverFramework()
    // eslint-disable-next-line no-new-func
    new Function(bootSource)()

    const event = { type: 'presentation_snapshot', snapshot: { snapshotId: 'snap-boot' } }
    receiver.emitMessage(event, 'sender-boot')

    const boot = (window as CastReceiverBootWindow).__riffsyncCastReceiver
    expect(boot?.queue).toEqual([{ data: event, senderId: 'sender-boot' }])

    const onMessage = vi.fn()
    if (boot) boot.onMessage = onMessage
    receiver.emitMessage(event, 'sender-boot')
    expect(onMessage).toHaveBeenCalledWith({ data: event, senderId: 'sender-boot' })
  })

  it('stays ES5 and does not use type=module syntax', () => {
    expect(bootSource).not.toMatch(/\b(?:const|let|class|=>|import |export )\b/)
    expect(bootSource).toContain('urn:x-cast:com.riffsync.presentation')
  })
})
