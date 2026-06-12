import { afterEach, describe, expect, it, vi } from 'vitest'
import { canParticipantAvPublish, createParticipantAvController } from './participantAvSession'

vi.stubGlobal(
  'MediaStream',
  function MockMediaStream(
    this: {
      tracks: MediaStreamTrack[]
      getTracks: () => MediaStreamTrack[]
      getVideoTracks: () => MediaStreamTrack[]
      getAudioTracks: () => MediaStreamTrack[]
    },
    tracks: MediaStreamTrack[] = [],
  ) {
    this.tracks = tracks
    this.getTracks = () => this.tracks
    this.getVideoTracks = () => this.tracks.filter((t) => t.kind === 'video')
    this.getAudioTracks = () => this.tracks.filter((t) => t.kind === 'audio')
  },
)

describe('canParticipantAvPublish', () => {
  it('requires fan JWT and av enabled regardless of chat websocket', () => {
    expect(canParticipantAvPublish({ fanToken: 'jwt', avDisabled: false })).toBe(true)
    expect(canParticipantAvPublish({ fanToken: null, avDisabled: false })).toBe(false)
    expect(canParticipantAvPublish({ fanToken: 'jwt', avDisabled: true })).toBe(false)
  })

  it('#205 regression: no wsOpen gate — chat websocket flap cannot block publish eligibility', () => {
    // Pre-#148 coupling consulted chat wsOpen; drawer-independent gate is fan JWT + avDisabled only.
    expect(canParticipantAvPublish({ fanToken: 'jwt', avDisabled: false })).toBe(true)
    expect(canParticipantAvPublish({ fanToken: null, avDisabled: false })).toBe(false)
  })
})

describe('createParticipantAvController', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal(
      'MediaStream',
      function MockMediaStream(
        this: {
          tracks: MediaStreamTrack[]
          getTracks: () => MediaStreamTrack[]
          getVideoTracks: () => MediaStreamTrack[]
          getAudioTracks: () => MediaStreamTrack[]
        },
        tracks: MediaStreamTrack[] = [],
      ) {
        this.tracks = tracks
        this.getTracks = () => this.tracks
        this.getVideoTracks = () => this.tracks.filter((t) => t.kind === 'video')
        this.getAudioTracks = () => this.tracks.filter((t) => t.kind === 'audio')
      },
    )
  })

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

  it('#205 regression: resetOnReconnect preserves both camera and mic toggles', async () => {
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

    const unpublishProducerClass = vi.fn()
    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    await controller.enableCamera()
    await controller.enableMic()
    const session = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream: vi.fn().mockResolvedValue(undefined),
      unpublishProducerKind: vi.fn(),
      unpublishProducerClass,
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    controller.attachSession(session)
    await vi.waitFor(() => {
      expect(session.publishStream).toHaveBeenCalled()
    })

    unpublishProducerClass.mockClear()
    videoTrack.stop.mockClear()
    audioTrack.stop.mockClear()

    controller.resetOnReconnect()

    expect(controller.getState()).toMatchObject({
      cameraEnabled: true,
      micEnabled: true,
      needsProducerToken: true,
      busy: false,
    })
    expect(unpublishProducerClass).not.toHaveBeenCalled()
    expect(videoTrack.stop).not.toHaveBeenCalled()
    expect(audioTrack.stop).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('resetOnReconnect preserves publish intent and only clears busy', async () => {
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

    const unpublishProducerClass = vi.fn()
    const controller = createParticipantAvController({
      canPublish: () => true,
    })
    await controller.enableCamera()
    const session = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream: vi.fn().mockResolvedValue(undefined),
      unpublishProducerKind: vi.fn(),
      unpublishProducerClass,
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    controller.attachSession(session)
    await vi.waitFor(() => {
      expect(session.publishStream).toHaveBeenCalled()
    })

    unpublishProducerClass.mockClear()
    videoTrack.stop.mockClear()

    controller.resetOnReconnect()

    expect(controller.getState()).toMatchObject({
      cameraEnabled: true,
      micEnabled: false,
      needsProducerToken: true,
      busy: false,
    })
    expect(unpublishProducerClass).not.toHaveBeenCalled()
    expect(videoTrack.stop).not.toHaveBeenCalled()
    expect(controller.getLocalPreviewStream()).not.toBeNull()

    vi.unstubAllGlobals()
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
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalled()
    })
    const publishedStream = publishStream.mock.calls[0][0] as MediaStream
    expect(publishedStream.getVideoTracks()).toHaveLength(1)
    expect(publishedStream.getAudioTracks()).toHaveLength(0)
    expect(publishStream.mock.calls[0][1]).toBe('participant_av')
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
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalled()
    })

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

  it('invokes onPartialUnpublish when camera turns off while mic stays on (#216)', async () => {
    const onPartialUnpublish = vi.fn()
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

    const controller = createParticipantAvController({
      canPublish: () => true,
      onPartialUnpublish,
    })
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
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalled()
    })

    onPartialUnpublish.mockClear()
    controller.disableCamera()

    expect(onPartialUnpublish).toHaveBeenCalledOnce()
    expect(unpublishProducerKind).toHaveBeenCalledWith('participant_av', 'video')

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
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalled()
    })

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

  it('sequential disable from both on ends with class-wide unpublish', async () => {
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
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalled()
    })

    unpublishProducerKind.mockClear()
    unpublishProducerClass.mockClear()

    controller.disableCamera()
    expect(unpublishProducerKind).toHaveBeenCalledWith('participant_av', 'video')
    expect(unpublishProducerClass).not.toHaveBeenCalled()

    unpublishProducerKind.mockClear()
    unpublishProducerClass.mockClear()

    controller.disableMic()
    expect(unpublishProducerClass).toHaveBeenCalledWith('participant_av')
    expect(unpublishProducerKind).not.toHaveBeenCalled()
    expect(controller.getState()).toMatchObject({
      cameraEnabled: false,
      micEnabled: false,
    })

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
    await vi.waitFor(() => {
      expect(session.publishStream).toHaveBeenCalled()
    })

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
    await vi.waitFor(() => {
      expect(session.publishStream).toHaveBeenCalled()
    })

    unpublishProducerKind.mockClear()

    controller.toggleMicMute()
    expect(pauseProducerKind).toHaveBeenCalledWith('participant_av', 'audio')
    expect(unpublishProducerKind).not.toHaveBeenCalled()

    controller.toggleMicMute()
    expect(resumeProducerKind).toHaveBeenCalledWith('participant_av', 'audio')

    vi.unstubAllGlobals()
  })

  it('syncPublish with mic only does not class-wide unpublish on attachSession replay', async () => {
    const unpublishProducerKind = vi.fn()
    const unpublishProducerClass = vi.fn()
    const publishStream = vi.fn().mockResolvedValue(undefined)
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
    await controller.enableMic()

    const session = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream,
      unpublishProducerKind,
      unpublishProducerClass,
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    controller.attachSession(session)
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalled()
    })

    expect(unpublishProducerClass).not.toHaveBeenCalled()
    expect(unpublishProducerKind).toHaveBeenCalledWith('participant_av', 'video')
    const publishedStream = publishStream.mock.calls[0][0] as MediaStream
    expect(publishedStream.getVideoTracks()).toHaveLength(0)
    expect(publishedStream.getAudioTracks()).toHaveLength(1)

    vi.unstubAllGlobals()
  })

  it('syncPublish after partial disable produces only the re-enabled kind', async () => {
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
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalled()
    })

    publishStream.mockClear()
    unpublishProducerClass.mockClear()
    unpublishProducerKind.mockClear()

    controller.disableCamera()
    publishStream.mockClear()
    unpublishProducerClass.mockClear()
    unpublishProducerKind.mockClear()

    await controller.enableCamera()
    await vi.waitFor(() => {
      expect(publishStream).toHaveBeenCalled()
    })

    expect(unpublishProducerClass).not.toHaveBeenCalled()
    expect(unpublishProducerKind).not.toHaveBeenCalled()
    const publishedStream = publishStream.mock.calls[0][0] as MediaStream
    expect(publishedStream.getVideoTracks()).toHaveLength(1)

    vi.unstubAllGlobals()
  })

  it('syncPublish produce failure clears publish state without orphan intent', async () => {
    const unpublishProducerClass = vi.fn()
    const publishStream = vi.fn().mockRejectedValue(new Error('produce failed'))
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

    const onNeedsProducerTokenChange = vi.fn()
    const controller = createParticipantAvController({
      canPublish: () => true,
      onNeedsProducerTokenChange,
    })
    await controller.enableCamera()

    const session = {
      supportsPublish: true,
      ready: Promise.resolve(),
      publishStream,
      unpublishProducerKind: vi.fn(),
      unpublishProducerClass,
      pauseProducerKind: vi.fn(),
      resumeProducerKind: vi.fn(),
    } as unknown as import('./mediasoupSharing').SfuUnifiedSessionHandle

    controller.attachSession(session)
    await vi.waitFor(() => {
      expect(unpublishProducerClass).toHaveBeenCalledWith('participant_av')
    })

    expect(controller.getState()).toMatchObject({
      cameraEnabled: false,
      micEnabled: false,
      needsProducerToken: false,
      error: 'sfu_publish_rejected',
    })
    expect(onNeedsProducerTokenChange).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})
