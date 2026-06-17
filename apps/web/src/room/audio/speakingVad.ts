export const SPEAKING_VAD_FFT_SIZE = 512
export const SPEAKING_VAD_RMS_THRESHOLD = 0.02
export const SPEAKING_VAD_ATTACK_MS = 150
export const SPEAKING_VAD_HANG_MS = 300

export type SpeakingHysteresisState = {
  speaking: boolean
  aboveSinceMs: number | null
  belowSinceMs: number | null
}

export const INITIAL_SPEAKING_HYSTERESIS: SpeakingHysteresisState = {
  speaking: false,
  aboveSinceMs: null,
  belowSinceMs: null,
}

export function computeNormalizedRms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sumSq = 0
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0
    sumSq += sample * sample
  }
  return Math.sqrt(sumSq / samples.length)
}

export function stepSpeakingHysteresis(
  state: SpeakingHysteresisState,
  rms: number,
  nowMs: number,
): SpeakingHysteresisState {
  const above = rms >= SPEAKING_VAD_RMS_THRESHOLD

  if (above) {
    const aboveSince = state.aboveSinceMs ?? nowMs
    if (!state.speaking && nowMs - aboveSince >= SPEAKING_VAD_ATTACK_MS) {
      return { speaking: true, aboveSinceMs: aboveSince, belowSinceMs: null }
    }
    return { ...state, aboveSinceMs: aboveSince, belowSinceMs: null }
  }

  if (!state.speaking) {
    return INITIAL_SPEAKING_HYSTERESIS
  }

  const belowSince = state.belowSinceMs ?? nowMs
  if (nowMs - belowSince >= SPEAKING_VAD_HANG_MS) {
    return INITIAL_SPEAKING_HYSTERESIS
  }

  return { ...state, aboveSinceMs: null, belowSinceMs: belowSince }
}

export function isSpeakingVadEnabled(snapshot: {
  hasAudioProducer: boolean
  audioPaused: boolean
}): boolean {
  return snapshot.hasAudioProducer && !snapshot.audioPaused
}
