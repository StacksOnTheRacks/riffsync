import { describe, expect, it, vi } from 'vitest'
import { createCastStartController } from './castStartController'
import type { CastPresentationSnapshot } from './castChannelProtocol'
import type { CastSenderClient, CastSenderSessionHandle } from './castSenderClient'

const snapshot: CastPresentationSnapshot = {
  roomMode: 'theater',
  stagePrimary: {
    kind: 'youtube_embed',
    youtubeVideoId: 'abc123',
    label: 'Party video',
  },
  chatOverlay: {
    messages: [{ id: 'm1', kind: 'text', text: 'Host: hello', senderLabel: 'Host' }],
  },
}

function createMockSession(handlers: {
  onSend?: (message: unknown) => void
  confirmAfterSend?: boolean
  failAfterSend?: boolean
}): CastSenderSessionHandle {
  const listeners = new Set<(message: unknown) => void>()
  return {
    sendMessage: async (message) => {
      handlers.onSend?.(message)
      if (handlers.confirmAfterSend) {
        for (const listener of listeners) listener({ type: 'render_confirmed' })
      }
      if (handlers.failAfterSend) {
        for (const listener of listeners) listener({ type: 'render_failed' })
      }
    },
    addMessageListener: (handler) => {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
    end: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockClient(session: CastSenderSessionHandle): CastSenderClient {
  return {
    requestSession: vi.fn().mockResolvedValue(session),
  }
}

describe('createCastStartController room authority (#277)', () => {
  it('active Cast sends only Cast channel overlay updates', async () => {
    const sent: unknown[] = []
    const session = createMockSession({
      confirmAfterSend: true,
      onSend: (message) => sent.push(message),
    })
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 1000,
    })

    await controller.startCast(snapshot)
    await controller.sendChatOverlayUpdate({
      ...snapshot,
      chatOverlay: {
        messages: [{ id: 'm2', kind: 'text', text: 'Host: updated', senderLabel: 'Host' }],
      },
    })

    expect(sent).toHaveLength(2)
    expect(sent[0]).toEqual({ type: 'presentation_snapshot', snapshot })
    expect(sent[1]).toEqual({
      type: 'chat_overlay_update',
      messages: [{ id: 'm2', kind: 'text', text: 'Host: updated', senderLabel: 'Host' }],
    })
    expect(session.end).not.toHaveBeenCalled()
  })

  it('stop intent ends the Cast session without room side effects', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 1000,
    })

    await controller.startCast(snapshot)
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('idle')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('start failure cleans up Cast session only', async () => {
    const session = createMockSession({ failAfterSend: true })
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 1000,
    })

    await controller.startCast(snapshot)

    expect(controller.getState().lifecycle).toBe('start_failed')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('render confirmation timeout cleans up Cast session only', async () => {
    vi.useFakeTimers()
    const session = createMockSession({})
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 50,
    })

    const promise = controller.startCast(snapshot)
    await vi.advanceTimersByTimeAsync(60)
    await promise

    expect(controller.getState().lifecycle).toBe('start_failed')
    expect(session.end).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('overlay update failure during active Cast is silent', async () => {
    const listeners = new Set<(message: unknown) => void>()
    const session: CastSenderSessionHandle = {
      sendMessage: vi
        .fn()
        .mockImplementationOnce(async (message) => {
          for (const listener of listeners) listener({ type: 'render_confirmed' })
          void message
        })
        .mockRejectedValueOnce(new Error('receiver disconnected')),
      addMessageListener: (handler) => {
        listeners.add(handler)
        return () => listeners.delete(handler)
      },
      end: vi.fn().mockResolvedValue(undefined),
    }
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 1000,
    })

    await controller.startCast(snapshot)
    await controller.sendChatOverlayUpdate(snapshot)

    expect(controller.getState().lifecycle).toBe('casting')
    expect(session.end).not.toHaveBeenCalled()
  })

  it('launch rejection maps to start_failed without an active session handle', async () => {
    const client: CastSenderClient = {
      requestSession: vi.fn().mockRejectedValue(new Error('user cancelled')),
    }
    const controller = createCastStartController({ client, confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)

    expect(controller.getState().lifecycle).toBe('start_failed')
  })
})
