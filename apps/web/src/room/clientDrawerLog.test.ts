import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clientDrawerLogForbiddenKeys,
  emitClientDrawerLog,
  type ClientDrawerLogPayload,
} from './clientDrawerLog'

describe('clientDrawerLog', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function lastSerialized(spy: typeof infoSpy): Record<string, string> {
    const call = spy.mock.calls.at(-1)
    expect(call).toBeDefined()
    return JSON.parse(String(call![0])) as Record<string, string>
  }

  it('serializes required drawer log fields as one JSON object', () => {
    emitClientDrawerLog({
      drawer: 'chat',
      event: 'ws_open',
      outcome: 'recovered',
    })

    expect(infoSpy).toHaveBeenCalledOnce()
    expect(lastSerialized(infoSpy)).toEqual({
      drawer: 'chat',
      event: 'ws_open',
      outcome: 'recovered',
    })
  })

  it('includes code when present', () => {
    emitClientDrawerLog({
      drawer: 'chat',
      event: 'send_dropped',
      code: 'CHAT_SEND_DROPPED',
      outcome: 'failed',
    })

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(lastSerialized(warnSpy)).toEqual({
      drawer: 'chat',
      event: 'send_dropped',
      outcome: 'failed',
      code: 'CHAT_SEND_DROPPED',
    })
  })

  it('routes lifecycle logs without code to console.info', () => {
    emitClientDrawerLog({
      drawer: 'signaling',
      event: 'signaling_connect',
      outcome: 'retry',
    })

    expect(infoSpy).toHaveBeenCalledOnce()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('routes coded failures to console.warn by default', () => {
    emitClientDrawerLog({
      drawer: 'connectivity',
      event: 'ice_failed',
      code: 'ICE_FAILED',
      outcome: 'failed',
    })

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(infoSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('routes explicit error severity to console.error', () => {
    emitClientDrawerLog({
      drawer: 'produce_consume',
      event: 'mix_error',
      code: 'THEATER_AUDIO_SUSPENDED',
      outcome: 'failed',
      severity: 'error',
    })

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(lastSerialized(errorSpy)).toEqual({
      drawer: 'produce_consume',
      event: 'mix_error',
      outcome: 'failed',
      code: 'THEATER_AUDIO_SUSPENDED',
    })
    expect(infoSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('allows info severity override when code is present', () => {
    emitClientDrawerLog({
      drawer: 'produce_consume',
      event: 'producer_closed',
      code: 'PRODUCER_CLOSED',
      outcome: 'failed',
      severity: 'info',
    })

    expect(infoSpy).toHaveBeenCalledOnce()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('never serializes forbidden identity or media keys', () => {
    const extras: ClientDrawerLogPayload & Record<string, unknown> = {
      drawer: 'chat',
      event: 'ws_close',
      outcome: 'retry',
      roomId: 'room-secret',
      sessionId: 'session-secret',
      sub: 'fan-sub',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.test',
      accessToken: 'token-secret',
      sdp: 'v=0\r\no=-',
      iceCandidate: 'candidate:1 1 UDP',
    }

    emitClientDrawerLog(extras)

    const serialized = lastSerialized(infoSpy)
    for (const key of clientDrawerLogForbiddenKeys) {
      expect(serialized).not.toHaveProperty(key)
    }
    expect(Object.keys(serialized).sort()).toEqual(['drawer', 'event', 'outcome'])
  })
})
