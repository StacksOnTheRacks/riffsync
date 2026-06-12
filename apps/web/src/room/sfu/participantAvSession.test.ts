import { describe, expect, it, vi } from 'vitest'
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

  it('failPublish turns toggles off and sets stable error code', () => {
    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    controller.failPublish('publisher_cap_exceeded')
    expect(controller.getState()).toMatchObject({
      cameraEnabled: false,
      micEnabled: false,
      needsProducerToken: false,
      error: 'publisher_cap_exceeded',
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

  it('attachSession(null) does not clear publish intent', () => {
    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    controller.attachSession(null)
    expect(controller.getState()).toMatchObject({
      cameraEnabled: false,
      micEnabled: false,
      needsProducerToken: false,
    })
  })

  it('syncPublish waits for a producer session instead of failing on consumer-only attach', async () => {
    const publishStream = vi.fn()
    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    const consumerSession = {
      supportsPublish: false,
      ready: Promise.resolve(),
      publishStream,
      unpublishProducerKind: vi.fn(),
      unpublishProducerClass: vi.fn(),
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    controller.attachSession(consumerSession)
    await new Promise((r) => setTimeout(r, 0))
    expect(publishStream).not.toHaveBeenCalled()
    expect(controller.getState().error).toBeNull()
  })

  it('syncPublish runs after attaching a producer session', async () => {
    const publishStream = vi.fn().mockResolvedValue(undefined)
    const mockTrack = { kind: 'video', readyState: 'live', stop: vi.fn() }
    const stream = {
      getVideoTracks: () => [mockTrack],
      getAudioTracks: () => [],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    })

    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    await controller.enableCamera()
    expect(controller.getState().cameraEnabled).toBe(true)

    const producerSession = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream,
      unpublishProducerKind: vi.fn(),
      unpublishProducerClass: vi.fn(),
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    controller.attachSession(producerSession)
    await new Promise((r) => setTimeout(r, 0))
    expect(publishStream).toHaveBeenCalledWith(stream, 'participant_av')
    expect(controller.getState().error).toBeNull()

    vi.unstubAllGlobals()
  })

  it('disableCamera with mic on unpublishes video kind only', async () => {
    const unpublishProducerKind = vi.fn()
    const unpublishProducerClass = vi.fn()
    const publishStream = vi.fn().mockResolvedValue(undefined)
    const videoTrack = { kind: 'video', readyState: 'live', stop: vi.fn(), id: 'v1' }
    const audioTrack = { kind: 'audio', readyState: 'live', stop: vi.fn(), id: 'a1' }
    const stream = {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
      getTracks: () => [videoTrack, audioTrack],
      removeTrack: vi.fn(),
    } as unknown as MediaStream

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    })

    const controller = createParticipantAvController({ canPublish: () => true })
    const session = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream,
      unpublishProducerKind,
      unpublishProducerClass,
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    await controller.enableCamera()
    await controller.enableMic()
    controller.attachSession(session)
    await new Promise((r) => setTimeout(r, 0))

    publishStream.mockClear()
    unpublishProducerKind.mockClear()
    unpublishProducerClass.mockClear()

    controller.disableCamera()

    expect(controller.getState().cameraEnabled).toBe(false)
    expect(controller.getState().micEnabled).toBe(true)
    expect(unpublishProducerKind).toHaveBeenCalledWith('participant_av', 'video')
    expect(unpublishProducerClass).not.toHaveBeenCalled()
    expect(publishStream).not.toHaveBeenCalled()
    expect(videoTrack.stop).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('disableMic with camera on unpublishes audio kind only', async () => {
    const unpublishProducerKind = vi.fn()
    const unpublishProducerClass = vi.fn()
    const publishStream = vi.fn().mockResolvedValue(undefined)
    const videoTrack = { kind: 'video', readyState: 'live', stop: vi.fn(), id: 'v1' }
    const audioTrack = { kind: 'audio', readyState: 'live', stop: vi.fn(), id: 'a1' }
    const stream = {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
      getTracks: () => [videoTrack, audioTrack],
      removeTrack: vi.fn(),
    } as unknown as MediaStream

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    })

    const controller = createParticipantAvController({ canPublish: () => true })
    const session = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream,
      unpublishProducerKind,
      unpublishProducerClass,
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    await controller.enableCamera()
    await controller.enableMic()
    controller.attachSession(session)
    await new Promise((r) => setTimeout(r, 0))

    publishStream.mockClear()
    unpublishProducerKind.mockClear()
    unpublishProducerClass.mockClear()

    controller.disableMic()

    expect(controller.getState().cameraEnabled).toBe(true)
    expect(controller.getState().micEnabled).toBe(false)
    expect(unpublishProducerKind).toHaveBeenCalledWith('participant_av', 'audio')
    expect(unpublishProducerClass).not.toHaveBeenCalled()
    expect(publishStream).not.toHaveBeenCalled()
    expect(audioTrack.stop).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('disableCamera with mic off uses class-wide unpublish', async () => {
    const unpublishProducerClass = vi.fn()
    const unpublishProducerKind = vi.fn()
    const videoTrack = { kind: 'video', readyState: 'live', stop: vi.fn(), id: 'v1' }
    const stream = {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [],
      getTracks: () => [videoTrack],
      removeTrack: vi.fn(),
    } as unknown as MediaStream

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    })

    const controller = createParticipantAvController({ canPublish: () => true })
    const session = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream: vi.fn().mockResolvedValue(undefined),
      unpublishProducerKind,
      unpublishProducerClass,
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    await controller.enableCamera()
    controller.attachSession(session)
    await new Promise((r) => setTimeout(r, 0))

    unpublishProducerClass.mockClear()
    unpublishProducerKind.mockClear()

    controller.disableCamera()

    expect(unpublishProducerClass).toHaveBeenCalledWith('participant_av')
    expect(unpublishProducerKind).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('toggleMicMute uses pause/resume without unpublish', async () => {
    const pauseProducerKind = vi.fn()
    const resumeProducerKind = vi.fn()
    const unpublishProducerKind = vi.fn()
    const audioTrack = { kind: 'audio', readyState: 'live', stop: vi.fn(), id: 'a1' }
    const stream = {
      getVideoTracks: () => [],
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack],
      removeTrack: vi.fn(),
    } as unknown as MediaStream

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    })

    const controller = createParticipantAvController({ canPublish: () => true })
    const session = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream: vi.fn().mockResolvedValue(undefined),
      unpublishProducerKind,
      unpublishProducerClass: vi.fn(),
      pauseProducerKind,
      resumeProducerKind,
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    await controller.enableMic()
    controller.attachSession(session)
    await new Promise((r) => setTimeout(r, 0))

    controller.toggleMicMute()
    expect(pauseProducerKind).toHaveBeenCalledWith('participant_av', 'audio')
    expect(unpublishProducerKind).not.toHaveBeenCalled()

    controller.toggleMicMute()
    expect(resumeProducerKind).toHaveBeenCalledWith('participant_av', 'audio')

    vi.unstubAllGlobals()
  })
})
