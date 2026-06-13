import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTheaterAudioMix } from '../audio/theaterAudioMix'
import { TheaterPlayback } from './TheaterPlayback'
import type { SfuMediaSession } from './SfuMediaSession'
import * as clientDrawerLog from '../clientDrawerLog'

vi.mock('../clientDrawerLog', () => ({
  emitClientDrawerLog: vi.fn(),
}))

vi.mock('../audio/theaterAudioMix', () => ({
  createTheaterAudioMix: vi.fn(),
}))

vi.stubGlobal(
  'MediaStream',
  function MockMediaStream(this: { tracks: MediaStreamTrack[] }, tracks?: MediaStreamTrack[]) {
    this.tracks = tracks ?? []
  },
)

function makeMixMock(overrides: Record<string, unknown> = {}) {
  const contextListeners: Array<(state: AudioContextState | undefined) => void> = []
  const mix = {
    dispose: vi.fn(),
    setAvDisabled: vi.fn(),
    setHostVideoElement: vi.fn(),
    onConsumerEvent: vi.fn(),
    resumeIfSuspended: vi.fn().mockResolvedValue(undefined),
    getAudioContextState: vi.fn().mockReturnValue('running' as AudioContextState),
    watchAudioContextState: vi.fn((listener: (state: AudioContextState | undefined) => void) => {
      contextListeners.push(listener)
      listener('running')
      return () => {
        const idx = contextListeners.indexOf(listener)
        if (idx >= 0) contextListeners.splice(idx, 1)
      }
    }),
    ...overrides,
  }
  return mix
}

function makeVideoElement(playImpl?: () => Promise<void>): HTMLVideoElement {
  return {
    srcObject: null,
    muted: false,
    play: playImpl ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as HTMLVideoElement
}

function makeTrack(kind: 'audio' | 'video', readyState: MediaStreamTrackState = 'live') {
  return { kind, readyState } as MediaStreamTrack
}

function makeStream(tracks: MediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  } as MediaStream
}

describe('TheaterPlayback', () => {
  beforeEach(() => {
    vi.mocked(createTheaterAudioMix).mockReset()
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates and disposes the audio mix when theater mode is enabled', () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)

    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    expect(createTheaterAudioMix).toHaveBeenCalledTimes(1)

    playback.configure({ enabled: false, isPublisher: false, avDisabled: false })
    expect(mix.dispose).toHaveBeenCalledTimes(1)
    playback.dispose()
  })

  it('routes SFU consumer attach/detach events into the mix graph', () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const consumerListeners: Array<(event: unknown) => void> = []
    const sfuSession = {
      onConsumerTrack: (listener: (event: unknown) => void) => {
        consumerListeners.push(listener)
        return () => undefined
      },
    } as unknown as SfuMediaSession

    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.attachSfuSession(sfuSession)

    const track = { id: 'a1' } as MediaStreamTrack
    consumerListeners[0]?.({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track,
    })
    expect(mix.onConsumerEvent).toHaveBeenCalledWith({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track,
    })

    consumerListeners[0]?.({ action: 'detach', producerId: 'fan-1' })
    expect(mix.onConsumerEvent).toHaveBeenCalledWith({
      action: 'detach',
      producerId: 'fan-1',
    })
    playback.dispose()
  })

  it('keeps participant mix routing when host_screen consumer detaches', () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const consumerListeners: Array<(event: unknown) => void> = []
    const sfuSession = {
      onConsumerTrack: (listener: (event: unknown) => void) => {
        consumerListeners.push(listener)
        return () => undefined
      },
    } as unknown as SfuMediaSession

    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.attachSfuSession(sfuSession)

    const participantTrack = { id: 'mic' } as MediaStreamTrack
    consumerListeners[0]?.({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: participantTrack,
    })
    consumerListeners[0]?.({ action: 'detach', producerId: 'host-1' })

    expect(mix.onConsumerEvent).toHaveBeenCalledTimes(2)
    playback.dispose()
  })

  it('updates guest host-screen FSM from remote stream liveness', () => {
    vi.useFakeTimers()
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const snapshots: Array<{ guestShareFsm: string }> = []
    const playback = new TheaterPlayback()
    playback.onSnapshotChange((s) => snapshots.push(s))
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })

    expect(playback.getSnapshot().guestShareFsm).toBe('idle')

    const remote = makeStream([makeTrack('video', 'live')])
    playback.setGuestRemote(remote)
    expect(playback.getSnapshot().guestShareFsm).toBe('running')

    playback.setGuestRemote(null)
    expect(playback.getSnapshot().guestShareFsm).toBe('idle')
    playback.dispose()
  })

  it('binds guest video unmuted so host_screen audio plays through the element', async () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const video = makeVideoElement()
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.setGuestVideoElement(video)
    playback.setGuestRemote(makeStream([makeTrack('video'), makeTrack('audio')]))

    await Promise.resolve()
    expect(video.srcObject).not.toBeNull()
    expect(video.muted).toBe(false)
    expect(video.play).toHaveBeenCalled()
    playback.dispose()
  })

  it('teardown clears mix on dispose', () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.setGuestRemote(makeStream([makeTrack('video')]))
    playback.dispose()

    expect(mix.dispose).toHaveBeenCalled()
  })

  it('stores youtube mount metadata without importing SFU signaling', () => {
    vi.mocked(createTheaterAudioMix).mockReturnValue(makeMixMock())
    const mount = { dataset: {} as DOMStringMap }
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: true, avDisabled: false })
    playback.setYoutubeMountElement(mount as unknown as HTMLElement)
    playback.setYoutubeVideoId('abc123')
    expect(mount.dataset.riffsyncYoutubeVideoId).toBe('abc123')
    playback.dispose()
  })

  it('reports torn-down lifecycle when theater mode is disabled', () => {
    vi.mocked(createTheaterAudioMix).mockReturnValue(makeMixMock())
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    expect(playback.getLifecycleState()).toBe('connected')

    playback.configure({ enabled: false, isPublisher: false, avDisabled: false })
    expect(playback.getLifecycleState()).toBe('torn-down')
    playback.dispose()
  })

  it('reports PLAYBACK_AUDIO_BLOCKED when guest video autoplay is blocked', async () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const video = makeVideoElement(() => Promise.reject(new Error('autoplay blocked')))
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.setGuestVideoElement(video)
    playback.setGuestRemote(makeStream([makeTrack('video')]))

    await Promise.resolve()
    expect(playback.getLifecycleState()).toBe('degraded')
    expect(playback.getLastErrorCode()).toBe('PLAYBACK_AUDIO_BLOCKED')
    playback.dispose()
  })

  it('reports degraded lifecycle when AudioContext is suspended', () => {
    const mix = makeMixMock({
      getAudioContextState: vi.fn().mockReturnValue('suspended' as AudioContextState),
    })
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })

    expect(playback.getLifecycleState()).toBe('degraded')
    expect(playback.getLastErrorCode()).toBe('THEATER_AUDIO_SUSPENDED')
    playback.dispose()
  })

  it('emits mix_error on produce_consume drawer for theater audio graph failures', async () => {
    const suspendedMix = makeMixMock({
      getAudioContextState: vi.fn().mockReturnValue('suspended' as AudioContextState),
    })
    vi.mocked(createTheaterAudioMix).mockReturnValue(suspendedMix)
    const suspendedPlayback = new TheaterPlayback()
    suspendedPlayback.configure({ enabled: true, isPublisher: false, avDisabled: false })

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'mix_error',
      code: 'THEATER_AUDIO_SUSPENDED',
      outcome: 'failed',
    })
    suspendedPlayback.dispose()

    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()

    const runningMix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(runningMix)
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    vi.mocked(clientDrawerLog.emitClientDrawerLog).mockClear()

    const video = makeVideoElement(() => Promise.reject(new Error('autoplay blocked')))
    playback.setGuestVideoElement(video)
    playback.setGuestRemote(makeStream([makeTrack('video')]))
    await Promise.resolve()

    expect(clientDrawerLog.emitClientDrawerLog).toHaveBeenCalledWith({
      drawer: 'produce_consume',
      event: 'mix_error',
      code: 'PLAYBACK_AUDIO_BLOCKED',
      outcome: 'failed',
    })

    playback.dispose()
  })

  it('returns to connected lifecycle after AudioContext resumes', async () => {
    const getAudioContextState = vi.fn().mockReturnValue('suspended' as AudioContextState)
    const resumeIfSuspended = vi.fn().mockImplementation(async () => {
      getAudioContextState.mockReturnValue('running' as AudioContextState)
    })
    const mix = makeMixMock({ getAudioContextState, resumeIfSuspended })
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    expect(playback.getLifecycleState()).toBe('degraded')

    playback.setGuestVideoElement(makeVideoElement())
    await playback.playGuestVideo()
    expect(playback.getLifecycleState()).toBe('connected')
    playback.dispose()
  })

  it('binds the full host_screen stream (audio+video) unmuted to the guest element', async () => {
    vi.mocked(createTheaterAudioMix).mockReturnValue(makeMixMock())
    const playback = new TheaterPlayback()
    playback.setMixEnabled(false)
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })

    const video = makeVideoElement()
    playback.setGuestVideoElement(video)
    playback.setGuestRemote(makeStream([makeTrack('video'), makeTrack('audio')]))

    await Promise.resolve()
    const bound = video.srcObject as unknown as { tracks: MediaStreamTrack[] }
    expect(bound.tracks).toHaveLength(2)
    expect(video.muted).toBe(false)
  })

  it('does not build the Web Audio mix when mix is disabled (tab-share default)', () => {
    vi.mocked(createTheaterAudioMix).mockReturnValue(makeMixMock())
    const playback = new TheaterPlayback()
    playback.setMixEnabled(false)
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    expect(createTheaterAudioMix).not.toHaveBeenCalled()
    expect(playback.getLifecycleState()).toBe('connected')
    playback.dispose()
  })

  it('reports degraded lifecycle when SFU signaling sibling reconnects after connect', () => {
    vi.mocked(createTheaterAudioMix).mockReturnValue(makeMixMock())
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    expect(playback.getLifecycleState()).toBe('connected')

    playback.notifySignalingSiblingState('connected')
    playback.notifySignalingSiblingState('reconnecting')
    expect(playback.getLifecycleState()).toBe('degraded')

    playback.notifySignalingSiblingState('connected')
    expect(playback.getLifecycleState()).toBe('connected')
    playback.dispose()
  })

  it('ignores SFU reconnecting before signaling has connected', () => {
    vi.mocked(createTheaterAudioMix).mockReturnValue(makeMixMock())
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })

    playback.notifySignalingSiblingState('reconnecting')
    expect(playback.getLifecycleState()).toBe('connected')
    playback.dispose()
  })

  it('detaches guest host-screen playback on share stop while preserving participant mix', async () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const consumerListeners: Array<(event: unknown) => void> = []
    const sfuSession = {
      onConsumerTrack: (listener: (event: unknown) => void) => {
        consumerListeners.push(listener)
        return () => undefined
      },
    } as unknown as SfuMediaSession

    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.attachSfuSession(sfuSession)
    const video = makeVideoElement()
    playback.setGuestVideoElement(video)

    playback.setGuestRemote(makeStream([makeTrack('video', 'live')]))
    await Promise.resolve()
    expect(playback.getSnapshot().guestShareFsm).toBe('running')
    expect(video.srcObject).not.toBeNull()

    consumerListeners[0]?.({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: { id: 'mic' } as MediaStreamTrack,
    })
    consumerListeners[0]?.({ action: 'detach', producerId: 'host-1' })
    playback.setGuestRemote(null)
    await Promise.resolve()

    expect(playback.getSnapshot().guestShareFsm).toBe('idle')
    expect(video.srcObject).toBeNull()
    expect(mix.onConsumerEvent).toHaveBeenCalledWith({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: { id: 'mic' },
    })
    expect(mix.onConsumerEvent).toHaveBeenCalledWith({ action: 'detach', producerId: 'host-1' })
    expect(mix.onConsumerEvent).not.toHaveBeenCalledWith({ action: 'detach', producerId: 'fan-1' })
    playback.dispose()
  })

  it('transitions guestShareFsm running to idle on setGuestRemote(null) share-stop (#212)', () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })

    playback.setGuestRemote(makeStream([makeTrack('video', 'live')]))
    expect(playback.getSnapshot().guestShareFsm).toBe('running')

    playback.setGuestRemote(null)
    expect(playback.getSnapshot().guestShareFsm).toBe('idle')
    playback.dispose()
  })

  it('theater guest FSM idle to verifying_media after share start before live track (#146 Guest theater started)', () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.setGuestVideoElement(makeVideoElement())

    expect(playback.getSnapshot().guestShareFsm).toBe('idle')

    playback.setGuestRemote(makeStream([makeTrack('video', 'ended')]))

    expect(playback.getSnapshot().guestShareFsm).toBe('verifying_media')
    playback.dispose()
  })

  it('stays connected when only host_screen consumer detaches (share_state stopped)', () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const consumerListeners: Array<(event: unknown) => void> = []
    const sfuSession = {
      onConsumerTrack: (listener: (event: unknown) => void) => {
        consumerListeners.push(listener)
        return () => undefined
      },
    } as unknown as SfuMediaSession

    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.attachSfuSession(sfuSession)

    consumerListeners[0]?.({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: { id: 'mic' } as MediaStreamTrack,
    })
    consumerListeners[0]?.({ action: 'detach', producerId: 'host-1' })

    expect(playback.getLifecycleState()).toBe('connected')
    expect(mix.onConsumerEvent).toHaveBeenCalledTimes(2)
    playback.dispose()
  })
})
