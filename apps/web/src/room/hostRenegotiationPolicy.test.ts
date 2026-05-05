import { describe, expect, it } from 'vitest'
import { hostShouldSkipRenegotiation } from './hostRenegotiationPolicy'

describe('hostShouldSkipRenegotiation', () => {
  it('skips while waiting on guest answer', () => {
    expect(
      hostShouldSkipRenegotiation({
        signalingState: 'have-local-offer',
        connectionState: 'new',
        hasRemoteDescription: false,
      }),
    ).toBe(true)
  })

  it('skips when stable with remote and ICE/link still settling', () => {
    expect(
      hostShouldSkipRenegotiation({
        signalingState: 'stable',
        connectionState: 'new',
        hasRemoteDescription: true,
      }),
    ).toBe(true)
    expect(
      hostShouldSkipRenegotiation({
        signalingState: 'stable',
        connectionState: 'connecting',
        hasRemoteDescription: true,
      }),
    ).toBe(true)
    expect(
      hostShouldSkipRenegotiation({
        signalingState: 'stable',
        connectionState: 'connected',
        hasRemoteDescription: true,
      }),
    ).toBe(true)
  })

  it('does not skip when negotiation failed so we can rebuild', () => {
    expect(
      hostShouldSkipRenegotiation({
        signalingState: 'stable',
        connectionState: 'failed',
        hasRemoteDescription: true,
      }),
    ).toBe(false)
  })

  it('does not skip when there is no in-flight or completed pairing', () => {
    expect(
      hostShouldSkipRenegotiation({
        signalingState: 'stable',
        connectionState: 'new',
        hasRemoteDescription: false,
      }),
    ).toBe(false)
  })
})
