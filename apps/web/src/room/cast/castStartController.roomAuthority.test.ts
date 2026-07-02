import { describe, expect, it, vi } from 'vitest'
import { buildReceiverRenderedAcknowledgement } from './castChannelProtocol'
import { createCastStartController } from './castStartController'
import type { CastPresentationSnapshot } from './castChannelProtocol'
import type { CastSenderClient, CastSenderSessionHandle } from './castSenderClient'

const snapshot: CastPresentationSnapshot = {
  snapshotId: 'snap-authority-1',
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
  const sessionEndedListeners = new Set<() => void>()
  const activeRoute = true
  return {
    sendMessage: async (message) => {
      handlers.onSend?.(message)
      if (handlers.confirmAfterSend && typeof message === 'object' && message !== null) {
        const outbound = message as { type?: string; snapshot?: CastPresentationSnapshot }
        if (outbound.type === 'presentation_snapshot' && outbound.snapshot?.snapshotId) {
          const ack = buildReceiverRenderedAcknowledgement(outbound.snapshot.snapshotId)
          for (const listener of listeners) listener(ack)
        }
      }
      if (handlers.failAfterSend) {
        for (const listener of listeners) listener({ type: 'render_failed' })
      }
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
    end: vi.fn().mockResolvedValue(undefined),
  }
}

function createMockClient(session: CastSenderSessionHandle): CastSenderClient {
  return {
    requestSession: vi.fn().mockResolvedValue(session),
  }
}

describe('createCastStartController room authority (#305)', () => {
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
          if (typeof message === 'object' && message !== null) {
            const outbound = message as { type?: string; snapshot?: CastPresentationSnapshot }
            if (outbound.type === 'presentation_snapshot' && outbound.snapshot?.snapshotId) {
              const ack = buildReceiverRenderedAcknowledgement(outbound.snapshot.snapshotId)
              for (const listener of listeners) listener(ack)
            }
          }
        })
        .mockRejectedValueOnce(new Error('receiver disconnected')),
      addMessageListener: (handler) => {
        listeners.add(handler)
        return () => listeners.delete(handler)
      },
      addSessionEndedListener: () => () => undefined,
      hasActiveRoute: () => true,
      end: vi.fn().mockResolvedValue(undefined),
    }
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 1000,
    })

    await controller.startCast(snapshot)
    await controller.sendChatOverlayUpdate(snapshot)

    expect(controller.getState().lifecycle).toBe('session_ended')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('launch rejection maps to start_failed without an active session handle', async () => {
    const client: CastSenderClient = {
      requestSession: vi.fn().mockRejectedValue(new Error('user cancelled')),
    }
    const controller = createCastStartController({ client, confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)

    expect(controller.getState().lifecycle).toBe('start_failed')
  })

  it('playback_blocked recovery ends Cast session without room side effects', async () => {
    const listeners = new Set<(message: unknown) => void>()
    const session: CastSenderSessionHandle = {
      sendMessage: vi
        .fn()
        .mockImplementationOnce(async (message) => {
          if (typeof message === 'object' && message !== null) {
            const outbound = message as { type?: string; snapshot?: CastPresentationSnapshot }
            if (outbound.type === 'presentation_snapshot' && outbound.snapshot?.snapshotId) {
              const ack = buildReceiverRenderedAcknowledgement(outbound.snapshot.snapshotId)
              for (const listener of listeners) listener(ack)
            }
          }
        }),
      addMessageListener: (handler) => {
        listeners.add(handler)
        return () => listeners.delete(handler)
      },
      addSessionEndedListener: () => () => undefined,
      hasActiveRoute: () => true,
      end: vi.fn().mockResolvedValue(undefined),
    }
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 1000,
    })

    await controller.startCast(snapshot)
    for (const listener of listeners) listener({ type: 'render_failed', reason: 'playback_blocked' })
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getState().lifecycle).toBe('playback_blocked')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('stop_failed keeps Cast session handle for retry without room side effects', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    session.end = vi.fn().mockRejectedValue(new Error('stop rejected'))
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 1000,
    })

    await controller.startCast(snapshot)
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('stop_failed')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('repeated cleanup after session_ended is idempotent', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const sessionEndedListeners = new Set<() => void>()
    const originalAddSessionEnded = session.addSessionEndedListener.bind(session)
    session.addSessionEndedListener = (handler) => {
      sessionEndedListeners.add(handler)
      return originalAddSessionEnded(handler)
    }
    const controller = createCastStartController({
      client: createMockClient(session),
      confirmationTimeoutMs: 1000,
    })

    await controller.startCast(snapshot)
    for (const listener of sessionEndedListeners) listener()
    await Promise.resolve()
    await controller.stopCast()
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('session_ended')
    expect(session.end).toHaveBeenCalledTimes(1)
  })
})
