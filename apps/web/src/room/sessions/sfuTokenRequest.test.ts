import { describe, expect, it } from 'vitest'
import { resolveSfuTokenRequest } from './sfuTokenRequest'
import type { ParticipantAvController } from '../sfu/participantAvSession'

function mockParticipantAv(needsProducerToken: boolean): ParticipantAvController {
  return {
    getState: () => ({
      cameraEnabled: needsProducerToken,
      micEnabled: false,
      micMuted: false,
      canPublish: needsProducerToken,
      needsProducerToken,
      error: null,
      busy: false,
    }),
    getLocalPreviewStream: () => null,
    subscribe: () => () => undefined,
    refreshPublishGate: () => undefined,
    attachSession: () => undefined,
    resetOnReconnect: () => undefined,
    enableCamera: async () => undefined,
    disableCamera: () => undefined,
    enableMic: async () => undefined,
    disableMic: () => undefined,
    toggleMicMute: () => undefined,
    teardownPublishing: () => undefined,
    failPublish: () => undefined,
    clearError: () => undefined,
  }
}

describe('resolveSfuTokenRequest', () => {
  it('host always requests both producer classes', () => {
    const request = resolveSfuTokenRequest({
      participantAv: mockParticipantAv(false),
      getHostScreenStream: () => null,
      isHost: true,
    })
    expect(request).toEqual({
      role: 'producer',
      producerClasses: ['host_screen', 'participant_av'],
    })
  })

  it('fan requests participant_av when camera/mic toggled on', () => {
    const request = resolveSfuTokenRequest({
      participantAv: mockParticipantAv(true),
      getHostScreenStream: () => null,
      isHost: false,
    })
    expect(request).toEqual({ role: 'producer', producerClasses: ['participant_av'] })
  })

  it('guest consumer when no publish intent', () => {
    const request = resolveSfuTokenRequest({
      participantAv: mockParticipantAv(false),
      getHostScreenStream: () => null,
      isHost: false,
    })
    expect(request).toEqual({ role: 'consumer' })
  })
})
