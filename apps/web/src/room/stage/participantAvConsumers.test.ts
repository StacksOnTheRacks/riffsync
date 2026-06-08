import { describe, expect, it } from 'vitest'
import { applyParticipantAvConsumerEvent } from './participantAvConsumers'

describe('participantAvConsumers', () => {
  it('tracks participant_av video attach events', () => {
    const track = { kind: 'video' } as MediaStreamTrack
    const next = applyParticipantAvConsumerEvent(new Map(), {
      action: 'attach',
      producerId: 'p1',
      sessionId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'video',
      track,
    })
    expect(next.get('p1')?.sessionId).toBe('fan-1')
    expect(next.get('p1')?.track).toBe(track)
  })

  it('ignores host_screen and audio attach events', () => {
    const track = { kind: 'audio' } as MediaStreamTrack
    const next = applyParticipantAvConsumerEvent(new Map(), {
      action: 'attach',
      producerId: 'p1',
      producerClass: 'host_screen',
      kind: 'video',
      track,
    })
    expect(next.size).toBe(0)
    const next2 = applyParticipantAvConsumerEvent(new Map(), {
      action: 'attach',
      producerId: 'p2',
      producerClass: 'participant_av',
      kind: 'audio',
      track,
    })
    expect(next2.size).toBe(0)
  })

  it('removes producer on detach', () => {
    const track = { kind: 'video' } as MediaStreamTrack
    const seeded = applyParticipantAvConsumerEvent(new Map(), {
      action: 'attach',
      producerId: 'p1',
      sessionId: 'fan-1',
      producerClass: 'participant_av',
      kind: 'video',
      track,
    })
    const next = applyParticipantAvConsumerEvent(seeded, {
      action: 'detach',
      producerId: 'p1',
    })
    expect(next.size).toBe(0)
  })
})
