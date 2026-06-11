const DISPLAY_TITLE_MAX_LEN = 120

type RoomRenameModalProps = {
  renameModalDraft: string
  patchErr: string | null
  onDraftChange: (draft: string) => void
  onCancel: () => void
  onSave: () => void
}

export function RoomRenameModal({
  renameModalDraft,
  patchErr,
  onDraftChange,
  onCancel,
  onSave,
}: RoomRenameModalProps) {
  return (
    <div className="riffsync-room-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="riffsync-room-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="riffsync-rename-room-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="riffsync-rename-room-title" className="riffsync-room-modal__heading">
          Rename Party
        </h2>
        <p className="riffsync-room-modal__lede riffsync-muted">
          This updates the lobby listing and &quot;Now playing&quot; label for everyone in the party.
        </p>
        <div className="riffsync-room-modal__form">
          <label className="riffsync-room-modal__label" htmlFor="riffsync-rename-room-input">
            Room name / now playing
          </label>
          <input
            id="riffsync-rename-room-input"
            className="riffsync-room-modal__field"
            maxLength={DISPLAY_TITLE_MAX_LEN}
            value={renameModalDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          {patchErr ? (
            <p className="riffsync-room-modal__err" role="alert">
              {patchErr}
            </p>
          ) : null}
        </div>
        <div className="riffsync-room-modal__actions">
          <button type="button" className="gen-button gen-button--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="gen-button" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
