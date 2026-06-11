import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTheaterAudioMix } from '../audio/theaterAudioMix'
import { TheaterPlayback } from './TheaterPlayback'
import type { SfuMediaSession } from './SfuMediaSession'

vi.mock('../audio/theaterAudioMix', () => ({
  createTheaterAudioMix: vi.fn(),
}))

vi.stubGlobal(
  'MediaStream',
  function MockMediaStream(this: { tracks: MediaStreamTrack[] }, tracks?: MediaStreamTrack[]) {
    this.tracks = tracks ?? []
  },
)

function makeMixMock() {
  return {
    dispose: vi.fn(),
    setAvDisabled: vi.fn(),
    setHostVideoElement: vi.fn(),
    onConsumerEvent: vi.fn(),
    resumeIfSuspended: vi.fn().mockResolvedValue(undefined),
    getAudioContextState: vi.fn().mockReturnValue(undefined),
  }
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
  } as MediaStream
}

describe('TheaterPlayback', () => {
  beforeEach(() => {
    vi.mocked(createTheaterAudioMix).mockReset()
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

  it('binds guest video with muted playback for theater mix', async () => {
    const mix = makeMixMock()
    vi.mocked(createTheaterAudioMix).mockReturnValue(mix)
    const video = makeVideoElement()
    const playback = new TheaterPlayback()
    playback.configure({ enabled: true, isPublisher: false, avDisabled: false })
    playback.setGuestVideoElement(video)
    playback.setGuestRemote(makeStream([makeTrack('video')]))

    await Promise.resolve()
    expect(video.srcObject).not.toBeNull()
    expect(video.muted).toBe(true)
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
})
