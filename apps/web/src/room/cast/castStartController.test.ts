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
}): CastSenderSessionHandle {
  const listeners = new Set<(message: unknown) => void>()
  return {
    sendMessage: async (message) => {
      handlers.onSend?.(message)
      if (handlers.confirmAfterSend) {
        for (const listener of listeners) listener({ type: 'render_confirmed' })
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

describe('createCastStartController', () => {
  it('transitions to casting after receiver render confirmation', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    const states: string[] = []
    controller.subscribe((state) => states.push(state.lifecycle))

    await controller.startCast(snapshot)

    expect(states).toEqual(['starting', 'casting'])
    expect(session.end).not.toHaveBeenCalled()
  })

  it('maps launch failure to start_failed and ends the session', async () => {
    const session = createMockSession({})
    const client: CastSenderClient = {
      requestSession: vi.fn().mockRejectedValue(new Error('user cancelled')),
    }
    const controller = createCastStartController({ client, confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)

    expect(controller.getState().lifecycle).toBe('start_failed')
    expect(session.end).not.toHaveBeenCalled()
  })

  it('maps render confirmation timeout to start_failed', async () => {
    vi.useFakeTimers()
    const session = createMockSession({})
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 50 })

    const promise = controller.startCast(snapshot)
    await vi.advanceTimersByTimeAsync(60)
    await promise

    expect(controller.getState().lifecycle).toBe('start_failed')
    expect(session.end).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stopCast ends the Cast session without mutating snapshot input', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('idle')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('transitions through stopping before idle on stopCast', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)

    const states: string[] = []
    controller.subscribe((state) => states.push(state.lifecycle))
    await controller.stopCast()

    expect(states).toEqual(['stopping', 'idle'])
  })

  it('stopCast is idempotent while stopping', async () => {
    let resolveEnd: (() => void) | undefined
    const session = createMockSession({ confirmAfterSend: true })
    session.end = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveEnd = resolve
        }),
    )
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    const firstStop = controller.stopCast()
    await controller.stopCast()
    resolveEnd?.()
    await firstStop

    expect(controller.getState().lifecycle).toBe('idle')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('proxies chat overlay updates while casting', async () => {
    const sent: unknown[] = []
    const session = createMockSession({
      confirmAfterSend: true,
      onSend: (message) => sent.push(message),
    })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    await controller.sendChatOverlayUpdate({
      ...snapshot,
      chatOverlay: {
        messages: [{ id: 'm2', kind: 'text', text: 'Host: updated', senderLabel: 'Host' }],
      },
    })

    expect(sent[1]).toEqual({
      type: 'chat_overlay_update',
      messages: [{ id: 'm2', kind: 'text', text: 'Host: updated', senderLabel: 'Host' }],
    })
  })
})
