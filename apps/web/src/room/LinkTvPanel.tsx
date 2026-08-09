import { useId, useState } from 'react'

export type LinkTvPanelProps = {
  open: boolean
  onClose: () => void
  onSubmitCode: (code: string) => Promise<void>
  linked: boolean
  onStopLink?: () => void
}

export function LinkTvPanel({ open, onClose, onSubmitCode, linked, onStopLink }: LinkTvPanelProps) {
  const titleId = useId()
  const inputId = useId()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      await onSubmitCode(code)
      setCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link TV')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="riffsync-link-tv-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="link-tv-panel"
    >
      <div className="riffsync-link-tv-panel__header">
        <h2 id={titleId} className="riffsync-link-tv-panel__title">
          Link TV
        </h2>
        <button type="button" className="gen-button riffsync-link-tv-panel__close" onClick={onClose}>
          Close
        </button>
      </div>
      {linked ? (
        <div className="riffsync-link-tv-panel__body">
          <p className="riffsync-link-tv-panel__status" role="status">
            TV linked. Party video and chat overlay are streaming to the TV client.
          </p>
          {onStopLink ? (
            <button type="button" className="gen-button gen-button-wide" onClick={onStopLink}>
              Stop Link TV
            </button>
          ) : null}
        </div>
      ) : (
        <div className="riffsync-link-tv-panel__body">
          <p className="riffsync-link-tv-panel__instructions">
            On your TV, open RiffSync and go to the TV page. Enter the code shown on the TV screen
            below to link this room.
          </p>
          <p className="riffsync-muted riffsync-link-tv-panel__hint">
            Tip: visit <strong>/tv</strong> in your TV browser, or use Cast for Chromecast devices.
          </p>
          <label className="riffsync-link-tv-panel__label" htmlFor={inputId}>
            TV code
          </label>
          <input
            id={inputId}
            className="riffsync-link-tv-panel__input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={8}
            placeholder="ABC123"
            disabled={busy}
          />
          {error ? (
            <p className="riffsync-link-tv-panel__error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="gen-button gen-button-wide"
            disabled={busy || code.trim().length < 4}
            onClick={() => void submit()}
          >
            {busy ? 'Linking…' : 'Link TV'}
          </button>
        </div>
      )}
    </div>
  )
}
