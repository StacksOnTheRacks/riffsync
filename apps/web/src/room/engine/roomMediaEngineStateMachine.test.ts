import { describe, expect, it } from 'vitest'
import {
  initialRoomMediaConnectionState,
  mergeConnectionPhases,
  transitionRoomMediaConnection,
} from './roomMediaEngineStateMachine'

describe('roomMediaEngineStateMachine', () => {
  it('bumps generation on phase transition', () => {
    let state = initialRoomMediaConnectionState()
    state = transitionRoomMediaConnection(state, 'wsConnecting')
    expect(state.phase).toBe('wsConnecting')
    expect(state.generation).toBe(1)
    state = transitionRoomMediaConnection(state, 'wsConnecting')
    expect(state.generation).toBe(1)
    state = transitionRoomMediaConnection(state, 'ready')
    expect(state.generation).toBe(2)
  })

  it('prefers ready when SFU is ready even if chat is wsReady', () => {
    expect(mergeConnectionPhases('wsReady', 'ready')).toBe('ready')
  })

  it('surfaces degraded over reconnecting', () => {
    expect(mergeConnectionPhases('degraded', 'reconnecting')).toBe('degraded')
  })
})
