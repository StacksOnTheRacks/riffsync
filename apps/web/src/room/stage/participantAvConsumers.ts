import type { SfuConsumerTrackEvent } from '../sfu/mediasoupSharing'

export type ParticipantAvVideoConsumer = {
  producerId: string
  sessionId: string | undefined
  track: MediaStreamTrack
}

export function applyParticipantAvConsumerEvent(
  state: Map<string, ParticipantAvVideoConsumer>,
  event: SfuConsumerTrackEvent,
): Map<string, ParticipantAvVideoConsumer> {
  if (event.action === 'detach') {
    if (!state.has(event.producerId)) return state
    const next = new Map(state)
    next.delete(event.producerId)
    return next
  }
  if (event.producerClass !== 'participant_av' || event.kind !== 'video') {
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
