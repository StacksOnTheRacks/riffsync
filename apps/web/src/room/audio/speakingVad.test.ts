import { describe, expect, it } from 'vitest'
import {
  INITIAL_SPEAKING_HYSTERESIS,
  SPEAKING_VAD_ATTACK_MS,
  SPEAKING_VAD_HANG_MS,
  SPEAKING_VAD_RMS_THRESHOLD,
  computeNormalizedRms,
  isSpeakingVadEnabled,
  stepSpeakingHysteresis,
  type SpeakingHysteresisState,
} from './speakingVad'

describe('speakingVad', () => {
  describe('computeNormalizedRms', () => {
    it('returns zero for silence', () => {
      expect(computeNormalizedRms(new Float32Array(8))).toBe(0)
    })

    it('returns normalized RMS for non-zero samples', () => {
      const samples = new Float32Array([0.5, -0.5, 0.5, -0.5])
      expect(computeNormalizedRms(samples)).toBeCloseTo(0.5, 5)
    })
  })

  describe('stepSpeakingHysteresis', () => {
    it('requires attack duration before entering speaking', () => {
      const t0 = 1_000
      let state = INITIAL_SPEAKING_HYSTERESIS
      state = stepSpeakingHysteresis(state, SPEAKING_VAD_RMS_THRESHOLD, t0)
      expect(state.speaking).toBe(false)

      state = stepSpeakingHysteresis(
        state,
        SPEAKING_VAD_RMS_THRESHOLD,
        t0 + SPEAKING_VAD_ATTACK_MS - 1,
      )
      expect(state.speaking).toBe(false)

      state = stepSpeakingHysteresis(
        state,
        SPEAKING_VAD_RMS_THRESHOLD,
        t0 + SPEAKING_VAD_ATTACK_MS,
      )
      expect(state.speaking).toBe(true)
    })

    it('holds speaking through brief silence then clears after hang', () => {
      const t0 = 2_000
      let state: SpeakingHysteresisState = {
        speaking: true,
        aboveSinceMs: t0,
        belowSinceMs: null,
      }

      const belowStart = t0 + 50
      state = stepSpeakingHysteresis(state, 0, belowStart)
      expect(state.speaking).toBe(true)

      state = stepSpeakingHysteresis(state, 0, belowStart + SPEAKING_VAD_HANG_MS - 1)
      expect(state.speaking).toBe(true)

      state = stepSpeakingHysteresis(state, 0, belowStart + SPEAKING_VAD_HANG_MS)
      expect(state.speaking).toBe(false)
    })

    it('clears immediately when not speaking and below threshold', () => {
      const state = stepSpeakingHysteresis(INITIAL_SPEAKING_HYSTERESIS, 0, 500)
      expect(state).toEqual(INITIAL_SPEAKING_HYSTERESIS)
    })
  })

  describe('isSpeakingVadEnabled', () => {
    it('is false when mic is off or muted', () => {
      expect(
        isSpeakingVadEnabled({ hasAudioProducer: false, audioPaused: false }),
      ).toBe(false)
      expect(
        isSpeakingVadEnabled({ hasAudioProducer: true, audioPaused: true }),
      ).toBe(false)
      expect(
        isSpeakingVadEnabled({ hasAudioProducer: true, audioPaused: false }),
      ).toBe(true)
    })
  })
})
