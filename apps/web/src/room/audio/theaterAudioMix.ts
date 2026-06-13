import type { SfuProducerClass } from '../sfu/mediasoupSharing'

export const THEATER_AUDIO_GAIN = 1.0

export type TheaterAudioConsumerEvent =
  | {
      action: 'attach'
      producerId: string
      producerClass: SfuProducerClass | undefined
      kind: 'audio' | 'video'
      track: MediaStreamTrack
    }
  | { action: 'detach'; producerId: string }

type AudioNodeBundle = {
  source: AudioNode
  gain: GainNode
}

export type TheaterAudioMix = {
  dispose: () => void
  setAvDisabled: (disabled: boolean) => void
  setHostVideoElement: (element: HTMLVideoElement | null) => void
  onConsumerEvent: (event: TheaterAudioConsumerEvent) => void
  resumeIfSuspended: () => Promise<void>
  getAudioContextState: () => AudioContextState | undefined
  watchAudioContextState: (listener: (state: AudioContextState | undefined) => void) => () => void
}

export type CreateTheaterAudioMixOptions = {
  createContext?: () => AudioContext
}

function isAudioAttachEvent(
  event: TheaterAudioConsumerEvent,
): event is Extract<TheaterAudioConsumerEvent, { action: 'attach' }> {
  return event.action === 'attach' && event.kind === 'audio'
}

export function shouldRouteConsumerAudio(
  producerClass: SfuProducerClass | undefined,
): producerClass is SfuProducerClass {
  return producerClass === 'host_screen' || producerClass === 'participant_av'
}

export function createTheaterAudioMix(options: CreateTheaterAudioMixOptions = {}): TheaterAudioMix {
  const createContext = options.createContext ?? (() => new AudioContext())
  let ctx: AudioContext | null = null
  let avDisabled = false
  let hostVideoEl: HTMLVideoElement | null = null
  let hostElementSource: MediaElementAudioSourceNode | null = null
  let hostElementGain: GainNode | null = null
  // A media element can be passed to createMediaElementSource only once for its entire lifetime;
  // a second call throws InvalidStateError. Reuse the node we already created for an element when
  // setHostVideoElement is invoked again (e.g. on capture-stream changes).
  const elementSourceCache = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
  const hostScreenConsumers = new Map<string, AudioNodeBundle>()
  const participantConsumers = new Map<string, AudioNodeBundle>()

  const contextStateListeners = new Set<(state: AudioContextState | undefined) => void>()
  let contextStateListenerAttached = false

  const emitContextState = () => {
    const state = ctx?.state
    for (const listener of contextStateListeners) listener(state)
  }

  const attachContextStateListener = (audioCtx: AudioContext) => {
    if (contextStateListenerAttached) return
    contextStateListenerAttached = true
    if (typeof audioCtx.addEventListener === 'function') {
      audioCtx.addEventListener('statechange', emitContextState)
    }
  }

  const ensureContext = (): AudioContext => {
    if (!ctx) {
      ctx = createContext()
      attachContextStateListener(ctx)
      emitContextState()
    }
    return ctx
  }

  const connectGain = (gain: GainNode) => {
    const audioCtx = ensureContext()
    gain.gain.value = THEATER_AUDIO_GAIN
    gain.connect(audioCtx.destination)
  }

  const setParticipantGainsActive = (active: boolean) => {
    for (const bundle of participantConsumers.values()) {
      bundle.gain.gain.value = active ? THEATER_AUDIO_GAIN : 0
    }
  }

  const clearHostElementSource = () => {
    if (hostElementGain) {
      try {
        hostElementGain.disconnect()
      } catch {
        /* ignore */
      }
      hostElementGain = null
    }
    if (hostElementSource) {
      try {
        hostElementSource.disconnect()
      } catch {
        /* ignore */
      }
      hostElementSource = null
    }
  }

  const clearHostScreenConsumers = () => {
    for (const [producerId, bundle] of hostScreenConsumers) {
      try {
        bundle.gain.disconnect()
        bundle.source.disconnect()
      } catch {
        /* ignore */
      }
      hostScreenConsumers.delete(producerId)
    }
  }

  const clearParticipantConsumers = () => {
    for (const [producerId, bundle] of participantConsumers) {
      try {
        bundle.gain.disconnect()
        bundle.source.disconnect()
      } catch {
        /* ignore */
      }
      participantConsumers.delete(producerId)
    }
  }

  const syncHostElementSource = () => {
    clearHostElementSource()
    if (!hostVideoEl || hostScreenConsumers.size > 0) return
    const audioCtx = ensureContext()
    let source = elementSourceCache.get(hostVideoEl)
    if (!source) {
      source = audioCtx.createMediaElementSource(hostVideoEl)
      elementSourceCache.set(hostVideoEl, source)
    }
    hostElementSource = source
    hostElementGain = audioCtx.createGain()
    hostElementSource.connect(hostElementGain)
    connectGain(hostElementGain)
  }

  const attachConsumerAudio = (
    map: Map<string, AudioNodeBundle>,
    producerId: string,
    track: MediaStreamTrack,
  ) => {
    const existing = map.get(producerId)
    if (existing) {
      try {
        existing.gain.disconnect()
        existing.source.disconnect()
      } catch {
        /* ignore */
      }
      map.delete(producerId)
    }
    const audioCtx = ensureContext()
    const stream = new MediaStream([track])
    const source = audioCtx.createMediaStreamSource(stream)
    const gain = audioCtx.createGain()
    source.connect(gain)
    connectGain(gain)
    if (map === participantConsumers && avDisabled) {
      gain.gain.value = 0
    }
    map.set(producerId, { source, gain })
  }

  const detachProducer = (producerId: string) => {
    const hostBundle = hostScreenConsumers.get(producerId)
    if (hostBundle) {
      try {
        hostBundle.gain.disconnect()
        hostBundle.source.disconnect()
      } catch {
        /* ignore */
      }
      hostScreenConsumers.delete(producerId)
      if (hostScreenConsumers.size === 0) {
        syncHostElementSource()
      }
      return
    }
    const participantBundle = participantConsumers.get(producerId)
    if (!participantBundle) return
    try {
      participantBundle.gain.disconnect()
      participantBundle.source.disconnect()
    } catch {
      /* ignore */
    }
    participantConsumers.delete(producerId)
  }

  return {
    dispose: () => {
      clearHostElementSource()
      clearHostScreenConsumers()
      clearParticipantConsumers()
      contextStateListeners.clear()
      if (ctx) {
        if (typeof ctx.removeEventListener === 'function') {
          try {
            ctx.removeEventListener('statechange', emitContextState)
          } catch {
            /* ignore */
          }
        }
        contextStateListenerAttached = false
        try {
          void ctx.close()
        } catch {
          /* ignore */
        }
        ctx = null
      }
      hostVideoEl = null
    },
    setAvDisabled: (disabled) => {
      avDisabled = disabled
      setParticipantGainsActive(!disabled)
    },
    setHostVideoElement: (element) => {
      hostVideoEl = element
      syncHostElementSource()
    },
    onConsumerEvent: (event) => {
      if (event.action === 'detach') {
        detachProducer(event.producerId)
        return
      }
      if (!isAudioAttachEvent(event)) return
      if (!shouldRouteConsumerAudio(event.producerClass)) return
      if (event.producerClass === 'host_screen') {
        clearHostElementSource()
        attachConsumerAudio(hostScreenConsumers, event.producerId, event.track)
        return
      }
      attachConsumerAudio(participantConsumers, event.producerId, event.track)
    },
    resumeIfSuspended: async () => {
      const audioCtx = ctx
      if (!audioCtx || audioCtx.state !== 'suspended') return
      try {
        await audioCtx.resume()
        emitContextState()
      } catch {
        /* ignore autoplay policy */
      }
    },
    getAudioContextState: () => ctx?.state,
    watchAudioContextState: (listener) => {
      contextStateListeners.add(listener)
      listener(ctx?.state)
      return () => contextStateListeners.delete(listener)
    },
  }
}
