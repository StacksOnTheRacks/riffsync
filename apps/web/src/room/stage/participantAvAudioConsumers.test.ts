import { describe, expect, it } from 'vitest'
import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'
import { applyParticipantAvAudioConsumerEvent } from './participantAvAudioConsumers'

describe('participantAvAudioConsumers', () => {
  it('stores participant_av audio attach events keyed by producerId', () => {
    const track = { kind: 'audio' } as MediaStreamTrack
    const event: SfuConsumerTrackEvent = {
      action: 'attach',
      producerId: 'p-a',
      producerClass: 'participant_av',
      kind: 'audio',
      sessionId: 'remote-1',
      track,
    }
    const next = applyParticipantAvAudioConsumerEvent(new Map(), event)
    expect(next.get('p-a')).toEqual({
      producerId: 'p-a',
      sessionId: 'remote-1',
      track,
    })
  })

  it('ignores non-participant_av and video attach events', () => {
    const track = { kind: 'video' } as MediaStreamTrack
    const event: SfuConsumerTrackEvent = {
      action: 'attach',
      producerId: 'p-v',
      producerClass: 'participant_av',
      kind: 'video',
      sessionId: 'remote-1',
      track,
    }
    expect(applyParticipantAvAudioConsumerEvent(new Map(), event).size).toBe(0)
  })

  it('removes producer on detach', () => {
    const track = { kind: 'audio' } as MediaStreamTrack
    const attach: SfuConsumerTrackEvent = {
      action: 'attach',
      producerId: 'p-a',
      producerClass: 'participant_av',
      kind: 'audio',
      sessionId: 'remote-1',
      track,
    }
    const state = applyParticipantAvAudioConsumerEvent(new Map(), attach)
    const detached = applyParticipantAvAudioConsumerEvent(state, {
      action: 'detach',
      producerId: 'p-a',
    })
    expect(detached.size).toBe(0)
  })
})
