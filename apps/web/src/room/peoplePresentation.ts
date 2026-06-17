import type { ParticipantProducerSnapshot } from './participantProducerRegistry'

export function shouldShowPeopleAvIndicators(
  rowSessionId: string,
  ownSessionId: string,
  fanToken: string | null,
): boolean {
  if (rowSessionId !== ownSessionId) return true
  return Boolean(fanToken)
}

export function peopleAvAriaLabel(snapshot: ParticipantProducerSnapshot): string {
  const cam = snapshot.hasVideoProducer ? 'camera on' : 'camera off'
  let mic: string
  if (!snapshot.hasAudioProducer) {
    mic = 'microphone off'
  } else if (snapshot.audioPaused) {
    mic = 'microphone muted'
  } else {
    mic = 'microphone on'
  }
  return `${cam}, ${mic}`
}
