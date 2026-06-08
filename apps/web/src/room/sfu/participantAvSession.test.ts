import { describe, expect, it } from 'vitest'
import { canParticipantAvPublish, createParticipantAvController } from './participantAvSession'

describe('canParticipantAvPublish', () => {
  it('requires open room websocket, fan JWT, and av enabled', () => {
    expect(
      canParticipantAvPublish({ wsOpen: true, fanToken: 'jwt', avDisabled: false }),
    ).toBe(true)
    expect(
      canParticipantAvPublish({ wsOpen: false, fanToken: 'jwt', avDisabled: false }),
    ).toBe(false)
    expect(
      canParticipantAvPublish({ wsOpen: true, fanToken: null, avDisabled: false }),
    ).toBe(false)
    expect(
      canParticipantAvPublish({ wsOpen: true, fanToken: 'jwt', avDisabled: true }),
    ).toBe(false)
  })
})

describe('createParticipantAvController', () => {
  it('defaults camera and mic off with no producer token intent', () => {
    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    expect(controller.getState()).toMatchObject({
      cameraEnabled: false,
      micEnabled: false,
      needsProducerToken: false,
    })
  })

  it('resetOnReconnect clears publish intent', () => {
    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    controller.resetOnReconnect()
    expect(controller.getState()).toMatchObject({
      cameraEnabled: false,
      micEnabled: false,
      micMuted: false,
      needsProducerToken: false,
      error: null,
      busy: false,
    })
  })

  it('teardownPublishing clears publish intent for kill switch', () => {
    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    controller.teardownPublishing()
    expect(controller.getState()).toMatchObject({
      cameraEnabled: false,
      micEnabled: false,
      micMuted: false,
      needsProducerToken: false,
      error: null,
      busy: false,
    })
  })
})
