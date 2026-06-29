import type { RefObject } from 'react'
import {
  CAST_ACTIVE_HEADING,
  CAST_ACTIVE_SUBCOPY,
  CAST_STOP_BUTTON_LABEL,
  RIFFSYNC_CAST_ACTIVE_STATUS_ID,
} from './castActiveStatusCopy'

type CastActiveStagePanelProps = {
  onStopCast: () => void
  stopCastButtonRef?: RefObject<HTMLButtonElement | null>
}

export function CastActiveStagePanel({ onStopCast, stopCastButtonRef }: CastActiveStagePanelProps) {
  return (
    <section
      className="riffsync-room-page__cast-active-stage"
      aria-labelledby="riffsync-cast-active-heading"
      data-testid="cast-active-stage-panel"
    >
      <h2 id="riffsync-cast-active-heading" className="riffsync-room-page__cast-active-heading">
        {CAST_ACTIVE_HEADING}
      </h2>
      <p
        id={RIFFSYNC_CAST_ACTIVE_STATUS_ID}
        className="riffsync-room-page__cast-active-subcopy"
        role="status"
        aria-live="polite"
      >
        {CAST_ACTIVE_SUBCOPY}
      </p>
      <button
        ref={stopCastButtonRef}
        type="button"
        className="gen-button riffsync-room-page__cast-stop-button"
        aria-describedby="riffsync-cast-active-heading"
        onClick={onStopCast}
      >
        {CAST_STOP_BUTTON_LABEL}
      </button>
    </section>
  )
}
