// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import { RIFFSYNC_CAST_NAMESPACE } from '../../room/cast/castChannelProtocol'
import {
  sendCastReceiverRenderFailed,
  sendCastReceiverRendered,
  startCastReceiverSession,
} from './castReceiverSession'

type ReceiverMessageHandler = (event: { data?: unknown; senderId?: string }) => void

type CastReceiverTestWindow = Window & {
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
      }
      system: {
        MessageType: {
          JSON: string
        }
      }
    }
  }
}

const snapshot: CastPresentationSnapshot = {
  snapshotId: 'snap-receiver-1',
  roomMode: 'theater',
  stagePrimary: {
    kind: 'youtube_embed',
    youtubeVideoId: 'yt-1',
    label: 'Party video',
  },
  chatOverlay: {
    messages: [{ id: 'm1', kind: 'text', text: 'Host: hello', senderLabel: 'Host' }],
  },
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

  ;(window as CastReceiverTestWindow).cast = {
    framework: {
      CastReceiverContext: {
        getInstance: () => context,
      },
      CastReceiverOptions: class {
        customNamespaces?: Record<string, string>
        disableIdleTimeout?: boolean
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

async function startReceiver() {
  const receiver = installReceiverFramework()
  const onPresentationSnapshot = vi.fn()
  const onChatOverlayUpdate = vi.fn()

  const startPromise = startCastReceiverSession({
    onPresentationSnapshot,
    onChatOverlayUpdate,
  })

  const script = document.querySelector(
    'script[data-riffsync-cast-receiver-framework="true"]',
  ) as HTMLScriptElement
  script.onload?.(new Event('load'))
  await startPromise

  return { ...receiver, onPresentationSnapshot, onChatOverlayUpdate }
}

describe('startCastReceiverSession', () => {
  afterEach(() => {
    document.head.innerHTML = ''
    delete (window as CastReceiverTestWindow).cast
  })

  it('disables CAF idle timeout so custom playback is not closed after ~5 minutes', async () => {
    const receiver = await startReceiver()

    expect(receiver.context.start).toHaveBeenCalledWith(
      expect.objectContaining({
        disableIdleTimeout: true,
      }),
    )
  })

  it('accepts presentation snapshots delivered as Cast object payloads', async () => {
    const receiver = await startReceiver()

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
      }),
    )
    expect(receiver.context.addCustomMessageListener.mock.invocationCallOrder[0]).toBeLessThan(
      receiver.context.start.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    )
    receiver.emitMessage({ type: 'presentation_snapshot', snapshot })

    expect(receiver.onPresentationSnapshot).toHaveBeenCalledWith(snapshot)
  })

  it('accepts chat overlay updates delivered as JSON strings', async () => {
    const receiver = await startReceiver()
    const messages = [{ id: 'm2', kind: 'text', text: 'Guest: hi', senderLabel: 'Guest' }]

    receiver.emitMessage(JSON.stringify({ type: 'chat_overlay_update', messages }))

    expect(receiver.onChatOverlayUpdate).toHaveBeenCalledWith(messages)
  })

  it('sendCastReceiverRendered emits receiver_rendered with snapshotId and render flags', async () => {
    const receiver = await startReceiver()
    receiver.emitMessage({ type: 'presentation_snapshot', snapshot }, 'sender-42')

    sendCastReceiverRendered(receiver.context, 'snap-receiver-1')

    expect(receiver.context.sendCustomMessage).toHaveBeenCalledWith(
      RIFFSYNC_CAST_NAMESPACE,
      'sender-42',
      {
        type: 'receiver_rendered',
        schemaVersion: 1,
        snapshotId: 'snap-receiver-1',
        stagePrimaryRendered: true,
        chatOverlayRendered: true,
      },
    )
  })

  it('sendCastReceiverRenderFailed emits render_failed to the active sender', async () => {
    const receiver = await startReceiver()
    receiver.emitMessage({ type: 'presentation_snapshot', snapshot }, 'sender-42')

    sendCastReceiverRenderFailed(receiver.context, 'transport_disconnected')

    expect(receiver.context.sendCustomMessage).toHaveBeenCalledWith(
      RIFFSYNC_CAST_NAMESPACE,
      'sender-42',
      {
        type: 'render_failed',
        reason: 'transport_disconnected',
      },
    )
  })
})
