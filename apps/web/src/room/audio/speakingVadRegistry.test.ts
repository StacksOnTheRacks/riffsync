// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createSpeakingVadRegistry } from './speakingVadRegistry'

function mockRegistry(overrides: Parameters<typeof createSpeakingVadRegistry>[0] = {}) {
  return createSpeakingVadRegistry({
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: vi.fn(),
    ...overrides,
  })
}

describe('speakingVadRegistry', () => {
  it('clears speaking when VAD is disabled for a session', () => {
    const mockAnalyser = {
      fftSize: 512,
      getFloatTimeDomainData: vi.fn(),
      disconnect: vi.fn(),
    }
    const mockSource = { connect: vi.fn(), disconnect: vi.fn() }
    const registry = mockRegistry({
      createAudioContext: () =>
        ({
          createMediaStreamSource: vi.fn(() => mockSource),
          createAnalyser: vi.fn(() => mockAnalyser),
          close: vi.fn(),
        }) as unknown as AudioContext,
    })

    const track = { readyState: 'live' } as MediaStreamTrack
    registry.syncSession('s1', track, true)
    registry.syncSession('s1', track, false)
    expect(registry.isSpeaking('s1')).toBe(false)
    registry.dispose()
  })

  it('clears speaking when session is removed', () => {
    const registry = mockRegistry({
      createAudioContext: () =>
        ({
          createMediaStreamSource: vi.fn(() => ({
            connect: vi.fn(),
            disconnect: vi.fn(),
          })),
          createAnalyser: vi.fn(() => ({
            fftSize: 512,
            getFloatTimeDomainData: vi.fn(),
            disconnect: vi.fn(),
          })),
          close: vi.fn(),
        }) as unknown as AudioContext,
    })

    registry.syncSession('s1', { readyState: 'live' } as MediaStreamTrack, true)
    registry.removeSession('s1')
    expect(registry.buildSpeakingMap(['s1']).get('s1')).toBe(false)
    registry.dispose()
  })

  it('does not enter speaking when disabled', () => {
    const registry = mockRegistry()
    registry.syncSession('s1', { readyState: 'live' } as MediaStreamTrack, false)
    expect(registry.isSpeaking('s1')).toBe(false)
    registry.dispose()
  })

  it('buildSpeakingMap returns false for unknown sessions', () => {
    const registry = mockRegistry()
    expect(registry.buildSpeakingMap(['unknown']).get('unknown')).toBe(false)
    registry.dispose()
  })
})
