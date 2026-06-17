import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'

export type ParticipantAvAudioConsumer = {
  producerId: string
  sessionId: string | undefined
  track: MediaStreamTrack
}

export function applyParticipantAvAudioConsumerEvent(
  state: Map<string, ParticipantAvAudioConsumer>,
  event: SfuConsumerTrackEvent,
): Map<string, ParticipantAvAudioConsumer> {
  if (event.action === 'detach') {
    if (!state.has(event.producerId)) return state
    const next = new Map(state)
    next.delete(event.producerId)
    return next
  }
  if (event.action !== 'attach') return state
  if (event.producerClass !== 'participant_av' || event.kind !== 'audio') {
    return state
  }
  const next = new Map(state)
  next.set(event.producerId, {
    producerId: event.producerId,
    sessionId: event.sessionId,
    track: event.track,
  })
  return next
}
