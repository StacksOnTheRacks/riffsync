import type { ParticipantProducerSnapshot } from './participantProducerRegistry'
import { peopleAvAriaLabel } from './peoplePresentation'

type PeopleRowAvIndicatorsProps = {
  snapshot: ParticipantProducerSnapshot
  speaking?: boolean
}

function CameraOnIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M17 10.5V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5l4 3v-9l-4 3z"
      />
    </svg>
  )
}

function CameraOffIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M3.27 2L2 3.27l2.76 2.76A1 1 0 0 0 5 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 .97-.76L20.73 22 22 20.73 3.27 2zM17 10.5V7a1 1 0 0 0-1-1h-1.18l2 2H17v2.5l2 1.5v-2.17l1.46 1.46A1 1 0 0 0 19 11h-2v-.5z"
      />
    </svg>
  )
}

function MicOnIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
      />
    </svg>
  )
}

function MicMutedIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5a3 3 0 0 0-5.86-1.02L7.1 8.28A3.01 3.01 0 0 0 9 11v.17l5.98 5.98zM4.27 3L3 4.27l6.01 6.01V11a3 3 0 0 0 3.18 2.99l1.66 1.66A4.98 4.98 0 0 1 7 11H5a7 7 0 0 0 6 6.92V21h2v-3.08c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"
      />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
        opacity="0.35"
      />
    </svg>
  )
}

export function PeopleRowAvIndicators({
  snapshot,
  speaking = false,
}: PeopleRowAvIndicatorsProps) {
  const camClass = snapshot.hasVideoProducer
    ? 'riffsync-room-page__people-av-icon riffsync-room-page__people-av-icon--on'
    : 'riffsync-room-page__people-av-icon riffsync-room-page__people-av-icon--off'

  let micClass = 'riffsync-room-page__people-av-icon riffsync-room-page__people-av-icon--off'
  let MicIcon = MicOffIcon
  if (snapshot.hasAudioProducer && snapshot.audioPaused) {
    micClass = 'riffsync-room-page__people-av-icon riffsync-room-page__people-av-icon--muted'
    MicIcon = MicMutedIcon
  } else if (snapshot.hasAudioProducer) {
    micClass = 'riffsync-room-page__people-av-icon riffsync-room-page__people-av-icon--on'
    MicIcon = MicOnIcon
  }

  return (
    <span
      className="riffsync-room-page__people-av"
      aria-label={peopleAvAriaLabel(snapshot, speaking)}
    >
      <span className={camClass} title={snapshot.hasVideoProducer ? 'Camera on' : 'Camera off'}>
        {snapshot.hasVideoProducer ? <CameraOnIcon /> : <CameraOffIcon />}
      </span>
      <span
        className={micClass}
        title={
          !snapshot.hasAudioProducer
            ? 'Microphone off'
            : snapshot.audioPaused
              ? 'Microphone muted'
              : 'Microphone on'
        }
      >
        <MicIcon />
      </span>
    </span>
  )
}
