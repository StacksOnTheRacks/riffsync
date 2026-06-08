import type { RoomMode } from '../api/roomsApi'

export type HostControlBarProps = {
  roomMode: RoomMode
  avDisabled: boolean
  busy: boolean
  error: string | null
  onSelectRoomMode: (mode: RoomMode) => void
  onToggleAvDisabled: (next: boolean) => void
}

const MODE_OPTIONS: Array<{ value: RoomMode; label: string }> = [
  { value: 'theater', label: 'Theater' },
  { value: 'videoChat', label: 'Video Chat' },
]

export function HostControlBar({
  roomMode,
  avDisabled,
  busy,
  error,
  onSelectRoomMode,
  onToggleAvDisabled,
}: HostControlBarProps) {
  const barDisabled = busy

  return (
    <div
      className="riffsync-room-page__host-bar"
      role="region"
      aria-label="Host room controls"
      aria-busy={busy || undefined}
    >
      <div
        className="riffsync-room-page__host-bar-layout"
        role="radiogroup"
        aria-label="Room layout"
      >
        {MODE_OPTIONS.map((opt) => {
          const videoChatInert = avDisabled && opt.value === 'videoChat'
          const optionDisabled = barDisabled || videoChatInert
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              className={`gen-button riffsync-room-page__host-bar-mode${roomMode === opt.value ? ' riffsync-room-page__host-bar-mode--on' : ''}`}
              aria-checked={roomMode === opt.value}
              aria-disabled={optionDisabled || undefined}
              disabled={barDisabled}
              onClick={() => {
                if (optionDisabled || roomMode === opt.value) return
                onSelectRoomMode(opt.value)
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className={`gen-button riffsync-room-page__host-bar-kill${avDisabled ? ' riffsync-room-page__host-bar-kill--on' : ''}`}
        aria-pressed={avDisabled}
        disabled={barDisabled}
        onClick={() => onToggleAvDisabled(!avDisabled)}
      >
        Disable room A/V
      </button>
      {error ? (
        <p className="riffsync-room-page__host-bar-err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
