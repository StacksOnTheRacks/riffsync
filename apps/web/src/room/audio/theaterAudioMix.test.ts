import { describe, expect, it, vi } from 'vitest'
import {
  createTheaterAudioMix,
  shouldRouteConsumerAudio,
  THEATER_AUDIO_GAIN,
} from './theaterAudioMix'

vi.stubGlobal(
  'MediaStream',
  function MockMediaStream(this: { tracks: MediaStreamTrack[] }, tracks: MediaStreamTrack[]) {
    this.tracks = tracks
  },
)

function makeTrack(id: string): MediaStreamTrack {
  return { id } as MediaStreamTrack
}

function makeMockAudioContext() {
  const destination = {}
  const gainNodes: Array<{
    gain: { value: number }
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }> = []
  const streamSources: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> =
    []
  const elementSources: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> =
    []

  const ctx = {
    state: 'suspended' as AudioContextState,
    destination,
    createGain: () => {
      const node = {
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      gainNodes.push(node)
      return node as unknown as GainNode
    },
    createMediaStreamSource: () => {
      const node = { connect: vi.fn(), disconnect: vi.fn() }
      streamSources.push(node)
      return node as unknown as MediaStreamAudioSourceNode
    },
    createMediaElementSource: () => {
      const node = { connect: vi.fn(), disconnect: vi.fn() }
      elementSources.push(node)
      return node as unknown as MediaElementAudioSourceNode
    },
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  }

  return { ctx: ctx as unknown as AudioContext, gainNodes, streamSources, elementSources }
}

describe('shouldRouteConsumerAudio', () => {
  it('accepts host_screen and participant_av', () => {
    expect(shouldRouteConsumerAudio('host_screen')).toBe(true)
    expect(shouldRouteConsumerAudio('participant_av')).toBe(true)
  })

  it('rejects unknown producer classes', () => {
    expect(shouldRouteConsumerAudio(undefined)).toBe(false)
  })
})

describe('createTheaterAudioMix', () => {
  it('attaches host_screen and participant_av audio at equal gain', () => {
    const { ctx, gainNodes } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })

    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'host-1',
      producerClass: 'host_screen',
      kind: 'audio',
      track: makeTrack('host-audio'),
    })
    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: makeTrack('fan-audio'),
    })

    expect(gainNodes).toHaveLength(2)
    expect(gainNodes[0]?.gain.value).toBe(THEATER_AUDIO_GAIN)
    expect(gainNodes[1]?.gain.value).toBe(THEATER_AUDIO_GAIN)
    mix.dispose()
  })

  it('detaches participant audio on producerClosed', () => {
    const { ctx, gainNodes } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })

    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: makeTrack('fan-audio'),
    })
    expect(gainNodes).toHaveLength(1)

    mix.onConsumerEvent({ action: 'detach', producerId: 'fan-1' })
    expect(gainNodes[0]?.disconnect).toHaveBeenCalled()
    mix.dispose()
  })

  it('mutes participant audio when avDisabled is true', () => {
    const { ctx, gainNodes } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })

    mix.setAvDisabled(true)
    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: makeTrack('fan-audio'),
    })

    expect(gainNodes[0]?.gain.value).toBe(0)

    mix.setAvDisabled(false)
    expect(gainNodes[0]?.gain.value).toBe(THEATER_AUDIO_GAIN)
    mix.dispose()
  })

  it('keeps host_screen audio active when avDisabled is true', () => {
    const { ctx, gainNodes } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })

    mix.setAvDisabled(true)
    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'host-1',
      producerClass: 'host_screen',
      kind: 'audio',
      track: makeTrack('host-audio'),
    })

    expect(gainNodes[0]?.gain.value).toBe(THEATER_AUDIO_GAIN)
    mix.dispose()
  })

  it('ignores video consumer attach events', () => {
    const { ctx, gainNodes } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })

    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'host-1',
      producerClass: 'host_screen',
      kind: 'video',
      track: makeTrack('host-video'),
    })

    expect(gainNodes).toHaveLength(0)
    mix.dispose()
  })

  it('falls back to host video element when no host_screen consumer exists', () => {
    const { ctx, elementSources } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })
    const video = {} as HTMLVideoElement

    mix.setHostVideoElement(video)

    expect(elementSources).toHaveLength(1)
    mix.dispose()
  })

  it('reuses the source node when the same host video element is set again', () => {
    const { ctx, elementSources } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })
    const video = {} as HTMLVideoElement

    mix.setHostVideoElement(video)
    mix.setHostVideoElement(null)
    mix.setHostVideoElement(video)

    // createMediaElementSource may run only once per element for its lifetime; a second call
    // throws InvalidStateError. The same element must reuse its cached source node.
    expect(elementSources).toHaveLength(1)
    mix.dispose()
  })

  it('prefers host_screen consumer audio over video element source', () => {
    const { ctx, elementSources, streamSources } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })
    const video = {} as HTMLVideoElement

    mix.setHostVideoElement(video)
    expect(elementSources).toHaveLength(1)

    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'host-1',
      producerClass: 'host_screen',
      kind: 'audio',
      track: makeTrack('host-audio'),
    })

    expect(streamSources).toHaveLength(1)
    expect(elementSources[0]?.disconnect).toHaveBeenCalled()
    mix.dispose()
  })

  it('keeps participant audio nodes connected when host_screen detaches', () => {
    const { ctx, gainNodes } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })

    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'host-1',
      producerClass: 'host_screen',
      kind: 'audio',
      track: makeTrack('host-audio'),
    })
    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: makeTrack('fan-audio'),
    })

    const participantGain = gainNodes[1]
    expect(participantGain?.gain.value).toBe(THEATER_AUDIO_GAIN)

    mix.onConsumerEvent({ action: 'detach', producerId: 'host-1' })

    expect(participantGain?.disconnect).not.toHaveBeenCalled()
    expect(participantGain?.gain.value).toBe(THEATER_AUDIO_GAIN)
    expect(ctx.close).not.toHaveBeenCalled()
    mix.dispose()
  })

  it('resumes a suspended AudioContext', async () => {
    const { ctx } = makeMockAudioContext()
    const mix = createTheaterAudioMix({ createContext: () => ctx })

    mix.onConsumerEvent({
      action: 'attach',
      producerId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'audio',
      track: makeTrack('fan-audio'),
    })

    await mix.resumeIfSuspended()
    expect(ctx.resume).toHaveBeenCalled()
    mix.dispose()
    expect(ctx.close).toHaveBeenCalled()
  })
})
