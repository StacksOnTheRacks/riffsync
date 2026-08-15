import { useId, useState } from 'react'
import { RoomVisibilityControl, type RoomVisibility } from './RoomVisibilityControl'

type RoomHostIconRowProps = {
  isPublisher: boolean
  onCopyShare: () => void
  onOpenRenameModal: () => void
  roomVisibility: RoomVisibility
  visibilityBusy: boolean
  visibilityErr: string | null
  onSelectRoomVisibility: (visibility: RoomVisibility) => void
}

export function RoomHostIconRow({
  isPublisher,
  onCopyShare,
  onOpenRenameModal,
  roomVisibility,
  visibilityBusy,
  visibilityErr,
  onSelectRoomVisibility,
}: RoomHostIconRowProps) {
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="riffsync-room-host-icons">
      <div className="riffsync-room-host-icons__row" role="group" aria-label="Room actions">
        <button
          type="button"
          className="riffsync-room-host-icons__btn"
          aria-label="Copy party link"
          title="Copy party link"
          onClick={onCopyShare}
        >
          <ShareNodesIcon />
        </button>
        {isPublisher ? (
          <button
            type="button"
            className={`riffsync-room-host-icons__btn${visibilityOpen ? ' riffsync-room-host-icons__btn--on' : ''}`}
            aria-label="Lobby visibility"
            title="Lobby visibility"
            aria-expanded={visibilityOpen}
            aria-controls={panelId}
            onClick={() => setVisibilityOpen((open) => !open)}
          >
            <EyeIcon />
          </button>
        ) : null}
        {isPublisher ? (
          <button
            type="button"
            className="riffsync-room-host-icons__btn"
            aria-label="Rename party"
            title="Rename party"
            onClick={onOpenRenameModal}
          >
            <TitleIcon />
          </button>
        ) : null}
      </div>
      {isPublisher && visibilityOpen ? (
        <div id={panelId} className="riffsync-room-host-icons__visibility">
          <RoomVisibilityControl
            visibility={roomVisibility}
            busy={visibilityBusy}
            error={visibilityErr}
            onSelectVisibility={(visibility) => {
              onSelectRoomVisibility(visibility)
              setVisibilityOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function ShareNodesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="riffsync-room-host-icons__svg">
      <circle cx="6" cy="12" r="2.25" fill="currentColor" />
      <circle cx="18" cy="6" r="2.25" fill="currentColor" />
      <circle cx="18" cy="18" r="2.25" fill="currentColor" />
      <path
        d="M8 11.2 16 7.2M8 12.8 16 16.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="riffsync-room-host-icons__svg">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  )
}

function TitleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="riffsync-room-host-icons__svg">
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M8 9h8M12 9v7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
