import {
  INITIAL_SPEAKING_HYSTERESIS,
  SPEAKING_VAD_FFT_SIZE,
  computeNormalizedRms,
  stepSpeakingHysteresis,
  type SpeakingHysteresisState,
} from './speakingVad'

type SessionVadRow = {
  track: MediaStreamTrack | null
  enabled: boolean
  source: MediaStreamAudioSourceNode | null
  analyser: AnalyserNode | null
  hysteresis: SpeakingHysteresisState
  speaking: boolean
}

export type SpeakingVadRegistry = {
  syncSession: (
    sessionId: string,
    track: MediaStreamTrack | null,
    enabled: boolean,
  ) => void
  removeSession: (sessionId: string) => void
  isSpeaking: (sessionId: string) => boolean
  buildSpeakingMap: (sessionIds: readonly string[]) => Map<string, boolean>
  dispose: () => void
}

export type CreateSpeakingVadRegistryOptions = {
  createAudioContext?: () => AudioContext
  onSpeakingChange?: () => void
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
  now?: () => number
}

function createEmptyRow(): SessionVadRow {
  return {
    track: null,
    enabled: false,
    source: null,
    analyser: null,
    hysteresis: INITIAL_SPEAKING_HYSTERESIS,
    speaking: false,
  }
}

export function createSpeakingVadRegistry(
  options: CreateSpeakingVadRegistryOptions = {},
): SpeakingVadRegistry {
  const createAudioContext = options.createAudioContext ?? (() => new AudioContext())
  const raf =
    options.requestAnimationFrame ??
    globalThis.requestAnimationFrame?.bind(globalThis) ??
    ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number)
  const cancelRaf =
    options.cancelAnimationFrame ??
    globalThis.cancelAnimationFrame?.bind(globalThis) ??
    ((handle: number) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>))
  const now = options.now ?? (() => performance.now())

  let ctx: AudioContext | null = null
  const sessions = new Map<string, SessionVadRow>()
  let rafId: number | null = null
  const sampleBuffer = new Float32Array(SPEAKING_VAD_FFT_SIZE)

  const ensureContext = (): AudioContext => {
    if (!ctx) {
      ctx = createAudioContext()
    }
    return ctx
  }

  const teardownGraph = (row: SessionVadRow): void => {
    try {
      row.source?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      row.analyser?.disconnect()
    } catch {
      /* ignore */
    }
    row.source = null
    row.analyser = null
  }

  const clearSpeaking = (row: SessionVadRow): boolean => {
    if (!row.speaking && row.hysteresis === INITIAL_SPEAKING_HYSTERESIS) {
      return false
    }
    row.speaking = false
    row.hysteresis = INITIAL_SPEAKING_HYSTERESIS
    return true
  }

  const applyGraph = (row: SessionVadRow): void => {
    teardownGraph(row)
    if (!row.enabled || !row.track || row.track.readyState !== 'live') return
    const audioCtx = ensureContext()
    const stream = new MediaStream([row.track])
    row.source = audioCtx.createMediaStreamSource(stream)
    row.analyser = audioCtx.createAnalyser()
    row.analyser.fftSize = SPEAKING_VAD_FFT_SIZE
    row.source.connect(row.analyser)
  }

  const hasActiveAnalyser = (): boolean => {
    for (const row of sessions.values()) {
      if (row.enabled && row.analyser) return true
    }
    return false
  }

  const stopLoop = (): void => {
    if (rafId === null) return
    cancelRaf(rafId)
    rafId = null
  }

  const tick = (): void => {
    let changed = false
    const t = now()

    for (const row of sessions.values()) {
      if (!row.enabled || !row.analyser) {
        if (clearSpeaking(row)) changed = true
        continue
      }

      row.analyser.getFloatTimeDomainData(sampleBuffer)
      const rms = computeNormalizedRms(sampleBuffer)
      const next = stepSpeakingHysteresis(row.hysteresis, rms, t)
      row.hysteresis = next
      if (next.speaking !== row.speaking) {
        row.speaking = next.speaking
        changed = true
      }
    }

    if (changed) {
      options.onSpeakingChange?.()
    }

    if (hasActiveAnalyser()) {
      rafId = raf(tick)
    } else {
      stopLoop()
    }
  }

  const ensureLoop = (): void => {
    if (rafId !== null || !hasActiveAnalyser()) return
    rafId = raf(tick)
  }

  const syncSession = (
    sessionId: string,
    track: MediaStreamTrack | null,
    enabled: boolean,
  ): void => {
    let row = sessions.get(sessionId)
    if (!row) {
      row = createEmptyRow()
      sessions.set(sessionId, row)
    }

    const trackChanged = row.track !== track
    const enabledChanged = row.enabled !== enabled
    row.track = track
    row.enabled = enabled

    if (!enabled) {
      teardownGraph(row)
      if (clearSpeaking(row)) {
        options.onSpeakingChange?.()
      }
      return
    }

    if (trackChanged || enabledChanged) {
      applyGraph(row)
    }

    ensureLoop()
  }

  const removeSession = (sessionId: string): void => {
    const row = sessions.get(sessionId)
    if (!row) return
    teardownGraph(row)
    sessions.delete(sessionId)
    if (clearSpeaking(row)) {
      options.onSpeakingChange?.()
    }
    if (!hasActiveAnalyser()) {
      stopLoop()
    }
  }

  return {
    syncSession,
    removeSession,
    isSpeaking: (sessionId) => sessions.get(sessionId)?.speaking ?? false,
    buildSpeakingMap: (sessionIds) => {
      const out = new Map<string, boolean>()
      for (const sessionId of sessionIds) {
        out.set(sessionId, sessions.get(sessionId)?.speaking ?? false)
      }
      return out
    },
    dispose: () => {
      stopLoop()
      for (const row of sessions.values()) {
        teardownGraph(row)
      }
      sessions.clear()
      if (ctx) {
        try {
          void ctx.close()
        } catch {
          /* ignore */
        }
        ctx = null
      }
    },
  }
}
