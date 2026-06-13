import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientDrawerLog from '../clientDrawerLog'
import { ICE_DISCONNECTED_FAILURE_MS } from '../realtimeDrawerErrors'
import {
  attachTransportConnectivityDrawerLog,
  iceServersRequireTurn,
  localDescriptionHasRelayCandidate,
} from './transportConnectivityDrawerLog'

vi.mock('../clientDrawerLog', () => ({
  emitClientDrawerLog: vi.fn(),
}))

type PcListener = () => void

class MockPeerConnection {
  iceConnectionState: RTCIceConnectionState = 'new'
  iceGatheringState: RTCIceGatheringState = 'new'
  connectionState: RTCPeerConnectionState = 'new'
  signalingState: RTCSignalingState = 'stable'
  localDescription: RTCSessionDescription | null = null
  private listeners = new Map<string, Set<PcListener>>()

  addEventListener(type: string, fn: PcListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }

  removeEventListener(type: string, fn: PcListener) {
    this.listeners.get(type)?.delete(fn)
  }

  emit(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn()
  }

  setIceConnectionState(state: RTCIceConnectionState) {
    this.iceConnectionState = state
    this.emit('iceconnectionstatechange')
  }

  setIceGatheringState(state: RTCIceGatheringState) {
    this.iceGatheringState = state
    this.emit('icegatheringstatechange')
  }
}

function mockTransport(pc: MockPeerConnection) {
  return {
    _handler: { _pc: pc as unknown as RTCPeerConnection },
  }
}

describe('iceServersRequireTurn', () => {
  it('detects turn and turns URLs', () => {
    expect(iceServersRequireTurn([{ urls: 'stun:stun.test' }])).toBe(false)
    expect(iceServersRequireTurn([{ urls: 'turn:turn.test:3478' }])).toBe(true)
    expect(iceServersRequireTurn([{ urls: ['stun:stun.test', 'turns:turn.test:5349'] }])).toBe(true)
  })
})

describe('localDescriptionHasRelayCandidate', () => {
  it('matches relay typ lines in SDP', () => {
    const pc = { localDescription: { sdp: 'a=candidate:1 1 udp typ relay raddr 1.2.3.4' } } as RTCPeerConnection
    expect(localDescriptionHasRelayCandidate(pc)).toBe(true)
    expect(
      localDescriptionHasRelayCandidate({ localDescription: { sdp: 'a=candidate:1 host' } } as RTCPeerConnection),
    ).toBe(false)
  })
})

describe('attachTransportConnectivityDrawerLog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits ice_failed when ICE connection state is failed', () => {
    const pc = new MockPeerConnection()
    const detach = attachTransportConnectivityDrawerLog(
      mockTransport(pc) as never,
      [{ urls: 'stun:stun.test' }],
    )

    pc.setIceConnectionState('failed')

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'connectivity',
      event: 'ice_failed',
      code: 'ICE_FAILED',
      outcome: 'failed',
    })

    detach()
  })

  it('emits ice_failed after disconnected grace elapses', () => {
    const pc = new MockPeerConnection()
    attachTransportConnectivityDrawerLog(mockTransport(pc) as never, [{ urls: 'stun:stun.test' }])

    pc.setIceConnectionState('disconnected')
    expect(clientDrawerLog.emitClientDrawerLog).not.toHaveBeenCalled()

    vi.advanceTimersByTime(ICE_DISCONNECTED_FAILURE_MS)
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'connectivity',
      event: 'ice_failed',
      code: 'ICE_FAILED',
      outcome: 'failed',
    })
  })

  it('emits ice_recovered after a prior failure clears', () => {
    const pc = new MockPeerConnection()
    attachTransportConnectivityDrawerLog(mockTransport(pc) as never, [{ urls: 'stun:stun.test' }])

    pc.setIceConnectionState('failed')
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()

    pc.setIceConnectionState('connected')
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'connectivity',
      event: 'ice_recovered',
      outcome: 'recovered',
    })
  })

  it('emits turn_relay_required only when ICE fails without a relay candidate', () => {
    const pc = new MockPeerConnection()
    pc.localDescription = { sdp: 'a=candidate:1 host', type: 'offer' } as RTCSessionDescription
    attachTransportConnectivityDrawerLog(mockTransport(pc) as never, [
      { urls: 'turn:turn.test:3478' },
    ])

    pc.setIceGatheringState('complete')
    expect(clientDrawerLog.emitClientDrawerLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'turn_relay_required' }),
    )

    pc.setIceConnectionState('failed')
    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'connectivity',
      event: 'turn_relay_required',
      code: 'TURN_RELAY_REQUIRED',
      outcome: 'failed',
    })
  })

  it('stays quiet when a direct connection succeeds without a relay candidate', () => {
    const pc = new MockPeerConnection()
    pc.localDescription = { sdp: 'a=candidate:1 host', type: 'offer' } as RTCSessionDescription
    attachTransportConnectivityDrawerLog(mockTransport(pc) as never, [
      { urls: 'turn:turn.test:3478' },
    ])

    pc.setIceGatheringState('complete')
    pc.setIceConnectionState('connected')

    expect(clientDrawerLog.emitClientDrawerLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'turn_relay_required' }),
    )
  })
})
