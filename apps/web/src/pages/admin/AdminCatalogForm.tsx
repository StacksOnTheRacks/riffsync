import { useCallback, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { refreshStaffTokensIfStale } from '../../auth/staffHostedUiPkce'
import { getStaffAccessToken } from '../../auth/staffTokens'
import {
  createStaffCatalogEpisode,
  patchStaffCatalogEpisode,
  StaffCatalogEpisodeConflictError,
  StaffCatalogValidationError,
  type StaffCatalogEpisode,
  type StaffCatalogEpisodeWrite,
} from '../../api/staffAdminCatalogApi'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from '../../api/staffAdminSessionApi'
import { formatCatalogEraLabel, type CatalogEra } from '../../catalog/catalogTypes'
import {
  mapValidationDetailsToFieldErrors,
  normalizeYoutubeField,
  validateCatalogEpisodeForm,
  type CatalogEpisodeFormMode,
  type CatalogEpisodeFormValues,
} from '../../catalog/validateCatalogEpisodeForm'

const CATALOG_ERAS: CatalogEra[] = ['joel', 'mike', 'jonah', 'emily', 'other']

const RECONCILE_HELPER =
  'These fields are updated by the scheduled reconcile job. Edit title or YouTube details above; TMDB art and tagline refresh automatically when matched.'

const CURATOR_HINTS_HELPER =
  'Operator hints stored in Dynamo. Editing hints ships in a follow-on milestone; values shown here are read-only.'

function formValuesToWriteBody(values: CatalogEpisodeFormValues): StaffCatalogEpisodeWrite {
  return {
    experimentNumber: Number.parseInt(values.experimentNumber.trim(), 10),
    title: values.title.trim(),
    era: values.era,
    youtubeVideoId: normalizeYoutubeField(values.youtubeVideoId),
    youtubeWatchUrl: normalizeYoutubeField(values.youtubeWatchUrl),
    carousel: values.carousel,
  }
}

function buildPatchBody(
  baseline: StaffCatalogEpisode,
  values: CatalogEpisodeFormValues,
): StaffCatalogEpisodeWrite {
  const next = formValuesToWriteBody(values)
  const body: StaffCatalogEpisodeWrite = {}
  if (next.experimentNumber !== baseline.experimentNumber) {
    body.experimentNumber = next.experimentNumber
  }
  if (next.title !== baseline.title) body.title = next.title
  if (next.era !== baseline.era) body.era = next.era
  if (next.youtubeVideoId !== baseline.youtubeVideoId) body.youtubeVideoId = next.youtubeVideoId
  if (next.youtubeWatchUrl !== baseline.youtubeWatchUrl) {
    body.youtubeWatchUrl = next.youtubeWatchUrl
  }
  if (next.carousel !== baseline.carousel) body.carousel = next.carousel
  return body
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="riffsync-admin-form-readonly-field">
      <span className="riffsync-admin-form-readonly-field__label">{label}</span>
      <span className="riffsync-admin-form-readonly-field__value">{value}</span>
    </div>
  )
}

export function AdminCatalogForm({
  mode,
  initialEpisode,
  initialValues,
  breadcrumbLeaf,
  pageTitle,
}: {
  mode: CatalogEpisodeFormMode
  initialEpisode: StaffCatalogEpisode | null
  initialValues: CatalogEpisodeFormValues
  breadcrumbLeaf: string
  pageTitle: string
}) {
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setField = useCallback(
    <K extends keyof CatalogEpisodeFormValues>(key: K, value: CatalogEpisodeFormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }))
      setFieldErrors((prev) => {
        if (!prev[key]) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
    },
    [],
  )

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const validation = validateCatalogEpisodeForm(values, mode)
    if (validation.formError || Object.keys(validation.fieldErrors).length > 0) {
      setFieldErrors(validation.fieldErrors)
      setFormError(validation.formError ?? null)
      return
    }

    setSaving(true)
    try {
      await refreshStaffTokensIfStale()
      const token = getStaffAccessToken()
      if (!token) {
        setFormError('Operator sign-in required')
        return
      }

      if (mode === 'create') {
        const id = values.id.trim()
        await createStaffCatalogEpisode(token, id, formValuesToWriteBody(values))
      } else if (initialEpisode) {
        const patchBody = buildPatchBody(initialEpisode, values)
        if (Object.keys(patchBody).length === 0) {
          navigate('/admin/catalog', { state: { saved: true } })
          return
        }
        await patchStaffCatalogEpisode(token, initialEpisode.id, patchBody)
      }

      navigate('/admin/catalog', { state: { saved: true } })
    } catch (e: unknown) {
      if (e instanceof StaffCatalogValidationError) {
        setFieldErrors(mapValidationDetailsToFieldErrors(e.details))
        setFormError('Fix the highlighted fields before saving.')
        return
      }
      if (e instanceof StaffCatalogEpisodeConflictError) {
        setFieldErrors({ id: e.message })
        return
      }
      if (e instanceof StaffSessionUnauthorizedError || e instanceof StaffSessionForbiddenError) {
        setFormError(e.message)
        return
      }
      setFormError(e instanceof Error ? e.message : 'Could not save episode')
    } finally {
      setSaving(false)
    }
  }

  const episode = initialEpisode
  const showTagline = Boolean(episode?.tagline?.trim())
  const reconcileFields = episode
    ? (
        [
          ['Poster image URL', episode.posterImageUrl],
          ['Backdrop image URL', episode.backdropImageUrl],
          ['TMDB movie id', episode.tmdbMovieId != null ? String(episode.tmdbMovieId) : null],
          ['TMDB artwork synced at', episode.tmdbArtworkSyncedAt],
          ['YouTube thumbnail URL', episode.youtubeThumbnailUrl],
        ] as const
      ).filter(([, v]) => v != null && String(v).trim() !== '')
    : []

  const hintFields = episode
    ? (
        [
          ['Movie search title', episode.movieSearchTitle],
          ['Embed allows', episode.embedAllows != null ? (episode.embedAllows ? 'Yes' : 'No') : null],
          ['Curator notes', episode.curatorNotes],
          ['TMDB needs review', episode.tmdbNeedsReview != null ? (episode.tmdbNeedsReview ? 'Yes' : 'No') : null],
        ] as const
      ).filter(([, v]) => v != null && String(v).trim() !== '')
    : []

  const showReconcileSection = mode === 'edit' && (showTagline || reconcileFields.length > 0)
  const showCuratorHintsSection = mode === 'edit' && (hintFields.length > 0 || episode?.embedAllows === false)

  return (
    <div className="container riffsync-admin-page riffsync-admin-catalog-form-page">
      <nav className="riffsync-admin-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/admin">Admin</Link>
          </li>
          <li>
            <Link to="/admin/catalog">Catalog</Link>
          </li>
          <li aria-current="page">{breadcrumbLeaf}</li>
        </ol>
      </nav>

      <header className="riffsync-admin-catalog-form-header">
        <h1>{pageTitle}</h1>
        {mode === 'edit' && episode ? (
          <p className="riffsync-admin-catalog-form-episode-id">
            Episode id: <code>{episode.id}</code>
          </p>
        ) : null}
      </header>

      {formError ? (
        <div role="alert" className="riffsync-scaffold-note riffsync-admin-catalog-form-alert">
          <p>{formError}</p>
          {formError === 'Operator sign-in required' ||
          formError.includes('Staff group') ||
          formError.toLowerCase().includes('unauthorized') ? (
            <p>
              <a href="/admin/login">Try operator sign-in again</a>
            </p>
          ) : null}
        </div>
      ) : null}

      <form className="riffsync-admin-catalog-form" onSubmit={onSubmit} noValidate>
        <fieldset className="riffsync-admin-form-section">
          <legend>Episode identity</legend>
          {mode === 'create' ? (
            <div className="riffsync-admin-form-field">
              <label htmlFor="catalog-form-id">Episode id</label>
              <input
                id="catalog-form-id"
                name="id"
                type="text"
                required
                autoComplete="off"
                value={values.id}
                onChange={(e) => setField('id', e.target.value)}
                aria-invalid={fieldErrors.id ? true : undefined}
                aria-describedby={fieldErrors.id ? 'catalog-form-id-error' : undefined}
                disabled={saving}
              />
              {fieldErrors.id ? (
                <p id="catalog-form-id-error" className="riffsync-admin-form-field-error" role="alert">
                  {fieldErrors.id}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="riffsync-admin-form-field">
            <label htmlFor="catalog-form-experiment">Experiment #</label>
            <input
              id="catalog-form-experiment"
              name="experimentNumber"
              type="number"
              min={0}
              step={1}
              required
              value={values.experimentNumber}
              onChange={(e) => setField('experimentNumber', e.target.value)}
              aria-invalid={fieldErrors.experimentNumber ? true : undefined}
              aria-describedby={
                fieldErrors.experimentNumber ? 'catalog-form-experiment-error' : undefined
              }
              disabled={saving}
            />
            {fieldErrors.experimentNumber ? (
              <p
                id="catalog-form-experiment-error"
                className="riffsync-admin-form-field-error"
                role="alert"
              >
                {fieldErrors.experimentNumber}
              </p>
            ) : null}
          </div>

          <div className="riffsync-admin-form-field">
            <label htmlFor="catalog-form-title">Title</label>
            <input
              id="catalog-form-title"
              name="title"
              type="text"
              required
              value={values.title}
              onChange={(e) => setField('title', e.target.value)}
              aria-invalid={fieldErrors.title ? true : undefined}
              aria-describedby={fieldErrors.title ? 'catalog-form-title-error' : undefined}
              disabled={saving}
            />
            {fieldErrors.title ? (
              <p id="catalog-form-title-error" className="riffsync-admin-form-field-error" role="alert">
                {fieldErrors.title}
              </p>
            ) : null}
          </div>

          <div className="riffsync-admin-form-field">
            <label htmlFor="catalog-form-era">Era</label>
            <select
              id="catalog-form-era"
              name="era"
              required
              value={values.era}
              onChange={(e) => setField('era', e.target.value as CatalogEra)}
              aria-invalid={fieldErrors.era ? true : undefined}
              aria-describedby={fieldErrors.era ? 'catalog-form-era-error' : undefined}
              disabled={saving}
            >
              {CATALOG_ERAS.map((era) => (
                <option key={era} value={era}>
                  {formatCatalogEraLabel(era)}
                </option>
              ))}
            </select>
            {fieldErrors.era ? (
              <p id="catalog-form-era-error" className="riffsync-admin-form-field-error" role="alert">
                {fieldErrors.era}
              </p>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="riffsync-admin-form-section">
          <legend>YouTube</legend>
          <div className="riffsync-admin-form-field">
            <label htmlFor="catalog-form-youtube-id">YouTube video id</label>
            <input
              id="catalog-form-youtube-id"
              name="youtubeVideoId"
              type="text"
              value={values.youtubeVideoId}
              onChange={(e) => setField('youtubeVideoId', e.target.value)}
              aria-invalid={fieldErrors.youtubeVideoId ? true : undefined}
              aria-describedby={
                fieldErrors.youtubeVideoId ? 'catalog-form-youtube-id-error' : undefined
              }
              disabled={saving}
              placeholder="Leave empty if unknown"
            />
            {fieldErrors.youtubeVideoId ? (
              <p
                id="catalog-form-youtube-id-error"
                className="riffsync-admin-form-field-error"
                role="alert"
              >
                {fieldErrors.youtubeVideoId}
              </p>
            ) : null}
          </div>

          <div className="riffsync-admin-form-field">
            <label htmlFor="catalog-form-youtube-url">YouTube watch URL</label>
            <input
              id="catalog-form-youtube-url"
              name="youtubeWatchUrl"
              type="url"
              value={values.youtubeWatchUrl}
              onChange={(e) => setField('youtubeWatchUrl', e.target.value)}
              aria-invalid={fieldErrors.youtubeWatchUrl ? true : undefined}
              aria-describedby={
                fieldErrors.youtubeWatchUrl ? 'catalog-form-youtube-url-error' : undefined
              }
              disabled={saving}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            {fieldErrors.youtubeWatchUrl ? (
              <p
                id="catalog-form-youtube-url-error"
                className="riffsync-admin-form-field-error"
                role="alert"
              >
                {fieldErrors.youtubeWatchUrl}
              </p>
            ) : null}
          </div>
        </fieldset>

        <fieldset className="riffsync-admin-form-section">
          <legend>Featured on home carousel</legend>
          <div className="riffsync-admin-form-field riffsync-admin-form-field--checkbox">
            <input
              id="catalog-form-carousel"
              name="carousel"
              type="checkbox"
              checked={values.carousel}
              onChange={(e) => setField('carousel', e.target.checked)}
              disabled={saving}
            />
            <label htmlFor="catalog-form-carousel">Show on home carousel</label>
          </div>
        </fieldset>

        {showReconcileSection ? (
          <fieldset className="riffsync-admin-form-section riffsync-admin-form-section--readonly">
            <legend>Reconcile (read-only)</legend>
            <p className="riffsync-admin-form-section-helper">{RECONCILE_HELPER}</p>
            {showTagline && episode?.tagline ? (
              <ReadOnlyField label="Tagline" value={episode.tagline} />
            ) : null}
            {reconcileFields.map(([label, value]) => (
              <ReadOnlyField key={label} label={label} value={String(value)} />
            ))}
          </fieldset>
        ) : null}

        {showCuratorHintsSection ? (
          <fieldset className="riffsync-admin-form-section riffsync-admin-form-section--readonly">
            <legend>Curator hints (read-only)</legend>
            <p className="riffsync-admin-form-section-helper">{CURATOR_HINTS_HELPER}</p>
            {episode?.embedAllows === false ? (
              <p className="riffsync-admin-form-embed-note" role="note">
                In-app embed is disabled for this episode.
              </p>
            ) : null}
            {hintFields.map(([label, value]) => (
              <ReadOnlyField key={label} label={label} value={String(value)} />
            ))}
          </fieldset>
        ) : null}

        <div className="riffsync-admin-catalog-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save episode'}
          </button>
          <Link to="/admin/catalog" className="btn btn-secondary riffsync-admin-catalog-form-cancel">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
