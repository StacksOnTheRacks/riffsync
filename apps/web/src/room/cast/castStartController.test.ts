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

type MockCastSession = CastSenderSessionHandle & {
  emitSessionEnded: () => void
  emitReceiverMessage: (message: unknown) => void
  setActiveRoute: (active: boolean) => void
  messageListenerCount: () => number
  sessionEndedListenerCount: () => number
}

function createMockSession(handlers: {
  onSend?: (message: unknown) => void
  confirmAfterSend?: boolean
}): MockCastSession {
  const listeners = new Set<(message: unknown) => void>()
  const sessionEndedListeners = new Set<() => void>()
  let activeRoute = true
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
    addSessionEndedListener: (handler) => {
      sessionEndedListeners.add(handler)
      return () => sessionEndedListeners.delete(handler)
    },
    hasActiveRoute: () => activeRoute,
    end: vi.fn().mockResolvedValue(undefined),
    emitSessionEnded: () => {
      activeRoute = false
      for (const listener of sessionEndedListeners) listener()
    },
    emitReceiverMessage: (message) => {
      for (const listener of listeners) listener(message)
    },
    setActiveRoute: (active) => {
      activeRoute = active
    },
    messageListenerCount: () => listeners.size,
    sessionEndedListenerCount: () => sessionEndedListeners.size,
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

  it('maps receiver render failure during startup to start_failed', async () => {
    const session = createMockSession({})
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    session.emitReceiverMessage({ type: 'render_failed', reason: 'receiver_render_error' })
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getState().lifecycle).toBe('start_failed')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('clears startup cleanup resources after receiver render failure', async () => {
    vi.useFakeTimers()
    const session = createMockSession({})
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 50 })

    await controller.startCast(snapshot)
    expect(session.messageListenerCount()).toBe(1)
    expect(session.sessionEndedListenerCount()).toBe(1)

    session.emitReceiverMessage({ type: 'render_failed', reason: 'receiver_render_error' })
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getState().lifecycle).toBe('start_failed')
    expect(session.end).toHaveBeenCalledTimes(1)
    expect(session.messageListenerCount()).toBe(0)
    expect(session.sessionEndedListenerCount()).toBe(0)

    session.emitReceiverMessage({ type: 'render_confirmed' })
    session.emitSessionEnded()
    await vi.advanceTimersByTimeAsync(60)

    expect(controller.getState().lifecycle).toBe('start_failed')
    expect(session.end).toHaveBeenCalledTimes(1)
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

  it('maps active session-ended callbacks to session_ended recovery', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    session.emitSessionEnded()
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getState().lifecycle).toBe('session_ended')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('cleans up active session-ended callbacks idempotently', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    session.emitSessionEnded()
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getState().lifecycle).toBe('session_ended')
    expect(session.messageListenerCount()).toBe(0)
    expect(session.sessionEndedListenerCount()).toBe(0)

    session.emitReceiverMessage({ type: 'render_failed', reason: 'late_receiver_error' })
    session.emitSessionEnded()
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('session_ended')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('resets recovery states to idle so Cast can be retried locally', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    session.emitSessionEnded()
    await Promise.resolve()
    await Promise.resolve()

    controller.resetStartFailure()

    expect(controller.getState().lifecycle).toBe('idle')
  })

  it('maps receiver render failure after active Cast to playback_blocked recovery', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    session.emitReceiverMessage({ type: 'render_failed', reason: 'playback_blocked' })
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getState().lifecycle).toBe('playback_blocked')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('releases active receiver bindings after playback-blocked cleanup', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    session.emitReceiverMessage({ type: 'render_failed', reason: 'playback_blocked' })
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getState().lifecycle).toBe('playback_blocked')
    expect(session.messageListenerCount()).toBe(0)
    expect(session.sessionEndedListenerCount()).toBe(0)

    session.emitReceiverMessage({ type: 'render_confirmed' })
    session.emitSessionEnded()
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('playback_blocked')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('keeps Stop Cast retryable when stop fails and the route is still active', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    session.end = vi.fn().mockRejectedValue(new Error('stop rejected'))
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('stop_failed')
    expect(session.end).toHaveBeenCalledTimes(1)

    session.end = vi.fn().mockResolvedValue(undefined)
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('idle')
    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('maps stop failure to session_ended when cleanup observes that the route is gone', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    session.end = vi.fn().mockRejectedValue(new Error('route already gone'))
    session.setActiveRoute(false)
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    await controller.stopCast()

    expect(controller.getState().lifecycle).toBe('session_ended')
    expect(session.messageListenerCount()).toBe(0)
    expect(session.sessionEndedListenerCount()).toBe(0)

    await controller.stopCast()

    expect(session.end).toHaveBeenCalledTimes(1)
  })

  it('detaches receiver listeners after successful cleanup', async () => {
    const session = createMockSession({ confirmAfterSend: true })
    const controller = createCastStartController({ client: createMockClient(session), confirmationTimeoutMs: 1000 })

    await controller.startCast(snapshot)
    await controller.stopCast()
    session.emitReceiverMessage({ type: 'render_failed', reason: 'late_receiver_error' })
    session.emitSessionEnded()
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.getState().lifecycle).toBe('idle')
    expect(session.end).toHaveBeenCalledTimes(1)
    expect(session.messageListenerCount()).toBe(0)
    expect(session.sessionEndedListenerCount()).toBe(0)
  })
})
