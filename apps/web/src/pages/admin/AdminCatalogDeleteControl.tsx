import { useCallback, useEffect, useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { refreshStaffTokensIfStale } from '../../auth/staffHostedUiPkce'
import { getStaffAccessToken } from '../../auth/staffTokens'
import { useAdminSession } from '../../admin/useAdminSession'
import { staffHasAdminGroup } from '../../admin/staffHasAdminGroup'
import {
  deleteStaffCatalogEpisode,
  StaffCatalogEpisodeInUseError,
  StaffCatalogEpisodeNotFoundError,
} from '../../api/staffAdminCatalogApi'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from '../../api/staffAdminSessionApi'
import { invalidatePublicCatalogQueries } from '../../catalog/catalogQueries'
import { formatCatalogEpisodeInUseMessage } from '../../catalog/formatCatalogEpisodeInUseMessage'

export function AdminCatalogDeleteControl({
  episodeId,
  onEpisodeNotFound,
}: {
  episodeId: string
  onEpisodeNotFound: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAdminSession()
  const dialogTitleId = useId()
  const confirmInputId = useId()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmId, setConfirmId] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setConfirmId('')
    setDialogError(null)
    setDeleting(false)
  }, [])

  const openDialog = () => {
    setConfirmId('')
    setDialogError(null)
    setDialogOpen(true)
  }

  useEffect(() => {
    if (!dialogOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) closeDialog()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeDialog, deleting, dialogOpen])

  if (!session || !staffHasAdminGroup(session.groups)) {
    return null
  }

  const confirmEnabled = confirmId === episodeId && !deleting

  const onDelete = async () => {
    if (!confirmEnabled) return
    setDialogError(null)
    setDeleting(true)
    try {
      await refreshStaffTokensIfStale()
      const token = getStaffAccessToken()
      if (!token) {
        setDialogError('Operator sign-in required')
        return
      }
      await deleteStaffCatalogEpisode(token, episodeId)
      await invalidatePublicCatalogQueries(queryClient)
      closeDialog()
      navigate('/admin/catalog', { state: { deleted: true } })
    } catch (e: unknown) {
      if (e instanceof StaffCatalogEpisodeNotFoundError) {
        closeDialog()
        onEpisodeNotFound()
        return
      }
      if (e instanceof StaffCatalogEpisodeInUseError) {
        setDialogError(formatCatalogEpisodeInUseMessage(e.references))
        return
      }
      if (e instanceof StaffSessionUnauthorizedError || e instanceof StaffSessionForbiddenError) {
        setDialogError(e.message)
        return
      }
      setDialogError('Could not delete episode. Try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="riffsync-admin-catalog-delete" aria-labelledby="admin-catalog-delete-heading">
      <h2 id="admin-catalog-delete-heading" className="riffsync-admin-catalog-delete__heading">
        Danger zone
      </h2>
      <p className="riffsync-admin-catalog-delete__lede">
        Permanently remove this episode from the catalog. Deletion is blocked while active watch
        parties or lists reference the episode.
      </p>
      <button type="button" className="btn btn-danger" onClick={openDialog} disabled={deleting}>
        Delete episode
      </button>

      {dialogOpen ? (
        <div
          className="riffsync-admin-modal-overlay"
          role="presentation"
          onClick={() => {
            if (!deleting) closeDialog()
          }}
        >
          <div
            className="riffsync-admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={dialogTitleId} className="riffsync-admin-modal__heading">
              Delete episode?
            </h2>
            <p className="riffsync-admin-modal__lede">
              This action is permanent. You cannot delete while active watch parties or lists still
              reference this episode.
            </p>
            <div className="riffsync-admin-modal__form">
              <label className="riffsync-admin-modal__label" htmlFor={confirmInputId}>
                Type <code>{episodeId}</code> to confirm
              </label>
              <input
                id={confirmInputId}
                className="riffsync-admin-modal__field"
                type="text"
                autoComplete="off"
                value={confirmId}
                onChange={(e) => setConfirmId(e.target.value)}
                disabled={deleting}
              />
            </div>
            {dialogError ? (
              <p className="riffsync-admin-modal__err" role="alert">
                {dialogError}
              </p>
            ) : null}
            <div className="riffsync-admin-modal__actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeDialog}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void onDelete()}
                disabled={!confirmEnabled}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
