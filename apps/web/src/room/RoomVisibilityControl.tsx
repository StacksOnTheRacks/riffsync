import { useId } from 'react'

export type RoomVisibility = 'public' | 'private'

export type RoomVisibilityControlProps = {
  visibility: RoomVisibility
  busy: boolean
  error: string | null
  onSelectVisibility: (visibility: RoomVisibility) => void
}

const VISIBILITY_OPTIONS: Array<{ value: RoomVisibility; label: string }> = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' },
]

export const ROOM_VISIBILITY_HINT =
  'Anyone with the party link can still join. Link-only rooms are hidden from Live Now.'

export function RoomVisibilityControl({
  visibility,
  busy,
  error,
  onSelectVisibility,
}: RoomVisibilityControlProps) {
  const hintId = useId()

  return (
    <div className="riffsync-room-page__visibility" role="region" aria-label="Visibility">
      <span className="riffsync-room-page__visibility-label" id={hintId}>
        Visibility
      </span>
      <div
        className="riffsync-room-page__visibility-options"
        role="radiogroup"
        aria-labelledby={hintId}
        aria-busy={busy || undefined}
      >
        {VISIBILITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            className={`gen-button riffsync-room-page__visibility-option${visibility === opt.value ? ' riffsync-room-page__visibility-option--on' : ''}`}
            aria-checked={visibility === opt.value}
            disabled={busy}
            onClick={() => {
              if (busy || visibility === opt.value) return
              onSelectVisibility(opt.value)
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="riffsync-room-page__visibility-hint riffsync-muted">{ROOM_VISIBILITY_HINT}</p>
      {error ? (
        <p className="riffsync-room-page__visibility-err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
