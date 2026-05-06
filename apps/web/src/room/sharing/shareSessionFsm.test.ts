import { describe, expect, it } from 'vitest'
import type { PcFsmSnapshot } from './shareSessionFsm'
import { deriveShareFsm } from './shareSessionFsm'

describe('deriveShareFsm', () => {
  const base: PcFsmSnapshot = {
    exists: true,
    connectionState: 'connected',
    signalingState: 'stable',
    iceConnectionState: 'connected',
  }

  it('idle when no peer', () => {
    expect(
      deriveShareFsm(
        { exists: false, connectionState: '', signalingState: '', iceConnectionState: '' },
        { recoveringIce: false, hasLiveRemoteVideo: false },
      ),
    ).toBe('idle')
  })

  it('failed on terminal connection states', () => {
    expect(
      deriveShareFsm(
        { ...base, connectionState: 'failed' },
        { recoveringIce: false, hasLiveRemoteVideo: true },
      ),
    ).toBe('failed')
  })

  it('recoveringIce flag wins', () => {
    expect(
      deriveShareFsm({ ...base, connectionState: 'connecting', iceConnectionState: 'checking' }, {
        recoveringIce: true,
        hasLiveRemoteVideo: false,
      }),
    ).toBe('recovering_ice')
  })

  it('connected + live tracks => running', () => {
    expect(
      deriveShareFsm(base, {
        recoveringIce: false,
        hasLiveRemoteVideo: true,
        mediaVerified: false,
      }),
    ).toBe('running')
  })

  it('connected without tracks => verifying_media', () => {
    expect(
      deriveShareFsm(base, {
        recoveringIce: false,
        hasLiveRemoteVideo: false,
        mediaVerified: undefined,
      }),
    ).toBe('verifying_media')
  })

  it('connecting peers => negotiating_ice', () => {
    expect(
      deriveShareFsm(
        { ...base, connectionState: 'connecting', iceConnectionState: 'checking' },
        { recoveringIce: false, hasLiveRemoteVideo: false },
      ),
    ).toBe('negotiating_ice')
  })
})
