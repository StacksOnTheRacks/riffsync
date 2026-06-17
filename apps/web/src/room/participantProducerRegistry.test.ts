import { describe, expect, it } from 'vitest'
import {
  applyAudioProducerPaused,
  applyProducerClosed,
  applyProducerOpened,
  buildParticipantProducerSnapshots,
  clearParticipantProducerRegistry,
  createParticipantProducerRegistryState,
  localSnapshotFromParticipantAv,
  snapshotForSession,
} from './participantProducerRegistry'

describe('participantProducerRegistry', () => {
  it('maps camera-on mic-off from remote producers', () => {
    let state = createParticipantProducerRegistryState()
    state = applyProducerOpened(state, 'p-v', 'fan-a', 'video')
    expect(snapshotForSession(state, 'fan-a')).toEqual({
      hasVideoProducer: true,
      hasAudioProducer: false,
      audioPaused: false,
    })
  })

  it('maps mic muted vs mic off', () => {
    let state = createParticipantProducerRegistryState()
    state = applyProducerOpened(state, 'p-a', 'fan-b', 'audio')
    expect(snapshotForSession(state, 'fan-b')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: true,
      audioPaused: false,
    })

    state = applyAudioProducerPaused(state, 'p-a', true)
    expect(snapshotForSession(state, 'fan-b')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: true,
      audioPaused: true,
    })

    state = applyProducerClosed(state, 'p-a')
    expect(snapshotForSession(state, 'fan-b')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: false,
      audioPaused: false,
    })
  })

  it('clears producer rows on close and registry reset', () => {
    let state = createParticipantProducerRegistryState()
    state = applyProducerOpened(state, 'p-v', 'fan-c', 'video')
    state = applyProducerOpened(state, 'p-a', 'fan-c', 'audio')
    state = applyProducerClosed(state, 'p-v')
    expect(snapshotForSession(state, 'fan-c').hasVideoProducer).toBe(false)
    expect(snapshotForSession(state, 'fan-c').hasAudioProducer).toBe(true)

    state = clearParticipantProducerRegistry()
    expect(snapshotForSession(state, 'fan-c')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: false,
      audioPaused: false,
    })
  })

  it('prefers local participant AV state for own sessionId', () => {
    const state = createParticipantProducerRegistryState()
    const local = localSnapshotFromParticipantAv({
      cameraEnabled: true,
      micEnabled: true,
      micMuted: true,
      canPublish: true,
      needsProducerToken: true,
      error: null,
      busy: false,
    })
    expect(snapshotForSession(state, 'self', local)).toEqual({
      hasVideoProducer: true,
      hasAudioProducer: true,
      audioPaused: true,
    })
  })

  it('builds snapshots for roster session ids', () => {
    let state = createParticipantProducerRegistryState()
    state = applyProducerOpened(state, 'p-v', 'remote-1', 'video')

    const map = buildParticipantProducerSnapshots(
      state,
      ['remote-1', 'self'],
      'self',
      {
        cameraEnabled: false,
        micEnabled: true,
        micMuted: false,
        canPublish: true,
        needsProducerToken: true,
        error: null,
        busy: false,
      },
    )

    expect(map.get('remote-1')).toEqual({
      hasVideoProducer: true,
      hasAudioProducer: false,
      audioPaused: false,
    })
    expect(map.get('self')).toEqual({
      hasVideoProducer: false,
      hasAudioProducer: true,
      audioPaused: false,
    })
  })
})
