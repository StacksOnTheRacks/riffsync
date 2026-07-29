import { useCallback, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import {
  CATALOG_CATEGORIES,
  formatCatalogLabel,
  type CatalogCategory,
} from '../../catalog/catalogTypes'
import {
  mapValidationDetailsToFieldErrors,
  normalizeCustomPlaybackUrlField,
  normalizeNullableTextField,
  normalizeStringListField,
  normalizeTmdbMovieIdField,
  validateCatalogEpisodeForm,
  type CatalogEpisodeFormMode,
  type CatalogEpisodeFormValues,
  type CatalogPlaybackHost,
} from '../../catalog/validateCatalogEpisodeForm'
import { parseYoutubeWatchUrl } from '../../catalog/youtubeUrl'
import { invalidatePublicCatalogQueries } from '../../catalog/catalogQueries'
import { AdminCatalogDeleteControl } from './AdminCatalogDeleteControl'

const RECONCILE_HELPER =
  'These fields are updated by the scheduled reconcile job. Pin a TMDB movie id or set a search title in Operator hints; art and tagline refresh on the next reconcile run.'

const OPERATOR_HINTS_HELPER =
  'Operator hints stored in Dynamo. tmdbMovieId locks reconcile to GET /movie/{id}; movieSearchTitle guides search when no id is set; embedAllows controls fan in-app YouTube embed only (not Custom playback).'

function formValuesToWriteBody(
  values: CatalogEpisodeFormValues,
): StaffCatalogEpisodeWrite {
  const body: StaffCatalogEpisodeWrite = {
    experimentNumber: Number.parseInt(values.experimentNumber.trim(), 10),
    title: values.title.trim(),
    catalog: values.catalog,
    tags: normalizeStringListField(values.tags),
    labels: normalizeStringListField(values.labels),
    carousel: values.carousel,
    spotlight: values.spotlight,
    movieSearchTitle: normalizeNullableTextField(values.movieSearchTitle),
    tmdbMovieId: normalizeTmdbMovieIdField(values.tmdbMovieId),
    embedAllows: values.embedAllows,
    playbackHost: values.playbackHost,
    customPlaybackUrl:
      values.playbackHost === 'custom'
        ? normalizeCustomPlaybackUrlField(values.customPlaybackUrl)
        : null,
  }
  const youtube = parseYoutubeWatchUrl(values.youtubeWatchUrl)
  if (youtube) {
    body.youtubeVideoId = youtube.videoId
    body.youtubeWatchUrl = youtube.canonicalWatchUrl
  } else {
    body.youtubeVideoId = null
    body.youtubeWatchUrl = null
  }
  return body
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
  if (next.catalog !== baseline.catalog) body.catalog = next.catalog
  if (JSON.stringify(next.tags ?? []) !== JSON.stringify(baseline.tags)) body.tags = next.tags
  if (JSON.stringify(next.labels ?? []) !== JSON.stringify(baseline.labels)) {
    body.labels = next.labels
  }
  if (next.youtubeVideoId !== baseline.youtubeVideoId) body.youtubeVideoId = next.youtubeVideoId
  if (next.youtubeWatchUrl !== baseline.youtubeWatchUrl) {
    body.youtubeWatchUrl = next.youtubeWatchUrl
  }
  const baselinePlaybackHost = baseline.playbackHost === 'custom' ? 'custom' : 'youtube'
  if (next.playbackHost !== baselinePlaybackHost) {
    body.playbackHost = next.playbackHost
  }
  if (values.playbackHost === 'custom') {
    const baselineCustomUrl = baseline.customPlaybackUrl ?? null
    if (next.customPlaybackUrl !== baselineCustomUrl) {
      body.customPlaybackUrl = next.customPlaybackUrl
    }
  }
  if (next.carousel !== baseline.carousel) body.carousel = next.carousel
  if (next.spotlight !== baseline.spotlight) body.spotlight = next.spotlight
  if (next.movieSearchTitle !== baseline.movieSearchTitle) {
    body.movieSearchTitle = next.movieSearchTitle
  }
  if (next.tmdbMovieId !== baseline.tmdbMovieId) {
    body.tmdbMovieId = next.tmdbMovieId
  }
  const baselineEmbedAllows = baseline.embedAllows !== false
  if (next.embedAllows !== baselineEmbedAllows) {
    body.embedAllows = next.embedAllows
  }
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

function TokenListField({
  id,
  label,
  helper,
  values,
  disabled,
  error,
  onChange,
}: {
  id: string
  label: string
  helper: string
  values: string[]
  disabled: boolean
  error?: string
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const helperId = `${id}-helper`
  const errorId = `${id}-error`

  const addDraft = useCallback(() => {
    const parts = draft
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    onChange(normalizeStringListField([...values, ...parts]))
    setDraft('')
  }, [draft, onChange, values])

  return (
    <div className="riffsync-admin-form-field">
      <label htmlFor={id}>{label}</label>
      <div className="riffsync-admin-token-field">
        {values.length > 0 ? (
          <ul className="riffsync-admin-token-field__list" aria-label={`${label} list`}>
            {values.map((value) => (
              <li key={value} className="riffsync-admin-token-field__token">
                <span>{value}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(values.filter((entry) => entry !== value))}
                  aria-label={`Remove ${value}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={addDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              addDraft()
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : helperId}
          disabled={disabled}
          placeholder="Type and press Enter"
        />
      </div>
      <p id={helperId} className="riffsync-admin-form-field-helper">
        {helper}
      </p>
      {error ? (
        <p id={errorId} className="riffsync-admin-form-field-error" role="alert">
          {error}
        </p>
      ) : null}
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
  const queryClient = useQueryClient()
  const [values, setValues] = useState(initialValues)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [episodeNotFound, setEpisodeNotFound] = useState(false)
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
          await invalidatePublicCatalogQueries(queryClient)
          navigate('/admin/catalog', { state: { saved: true } })
          return
        }
        await patchStaffCatalogEpisode(token, initialEpisode.id, patchBody)
      }

      await invalidatePublicCatalogQueries(queryClient)
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
          ['TMDB artwork synced at', episode.tmdbArtworkSyncedAt],
          ['YouTube thumbnail URL', episode.youtubeThumbnailUrl],
        ] as const
      ).filter(([, v]) => v != null && String(v).trim() !== '')
    : []

  const showReconcileSection = mode === 'edit' && (showTagline || reconcileFields.length > 0)
  const showTmdbNeedsReview =
    mode === 'edit' && episode?.tmdbNeedsReview != null

  if (episodeNotFound) {
    return (
      <div className="container riffsync-admin-page">
        <div role="alert" className="riffsync-scaffold-note">
          <p>Episode not found.</p>
          <p>
            <Link to="/admin/catalog">Back to catalog</Link>
          </p>
        </div>
      </div>
    )
  }

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
            <label htmlFor="catalog-form-catalog">Catalog</label>
            <select
              id="catalog-form-catalog"
              name="catalog"
              required
              value={values.catalog}
              onChange={(e) => setField('catalog', e.target.value as CatalogCategory)}
              aria-invalid={fieldErrors.catalog ? true : undefined}
              aria-describedby={fieldErrors.catalog ? 'catalog-form-catalog-error' : undefined}
              disabled={saving}
            >
              {CATALOG_CATEGORIES.map((catalog) => (
                <option key={catalog} value={catalog}>
                  {formatCatalogLabel(catalog)}
                </option>
              ))}
            </select>
            {fieldErrors.catalog ? (
              <p id="catalog-form-catalog-error" className="riffsync-admin-form-field-error" role="alert">
                {fieldErrors.catalog}
              </p>
            ) : null}
          </div>

          <TokenListField
            id="catalog-form-tags"
            label="Tags"
            helper='Search/filter metadata, e.g. "Era: Joel", "Genre: Comedy", "Season: 3".'
            values={values.tags}
            disabled={saving}
            error={fieldErrors.tags}
            onChange={(next) => setField('tags', next)}
          />

          <TokenListField
            id="catalog-form-labels"
            label="Labels"
            helper="Short badges shown on catalog cards."
            values={values.labels}
            disabled={saving}
            error={fieldErrors.labels}
            onChange={(next) => setField('labels', next)}
          />
        </fieldset>

        <fieldset className="riffsync-admin-form-section">
          <legend>Playback</legend>
          <div className="riffsync-admin-form-field">
            <label htmlFor="catalog-form-playback-host">Playback host</label>
            <select
              id="catalog-form-playback-host"
              name="playbackHost"
              value={values.playbackHost}
              onChange={(e) => setField('playbackHost', e.target.value as CatalogPlaybackHost)}
              aria-invalid={fieldErrors.playbackHost ? true : undefined}
              aria-describedby={
                fieldErrors.playbackHost ? 'catalog-form-playback-host-error' : undefined
              }
              disabled={saving}
            >
              <option value="youtube">YouTube</option>
              <option value="custom">Custom</option>
            </select>
            {fieldErrors.playbackHost ? (
              <p
                id="catalog-form-playback-host-error"
                className="riffsync-admin-form-field-error"
                role="alert"
              >
                {fieldErrors.playbackHost}
              </p>
            ) : null}
          </div>

          {values.playbackHost === 'youtube' ? (
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
                placeholder="https://www.youtube.com/watch?v=xxxxxxxxxxx"
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
          ) : (
            <div className="riffsync-admin-form-field">
              <label htmlFor="catalog-form-custom-playback-url">Custom playback URL</label>
              <input
                id="catalog-form-custom-playback-url"
                name="customPlaybackUrl"
                type="url"
                required
                value={values.customPlaybackUrl}
                onChange={(e) => setField('customPlaybackUrl', e.target.value)}
                aria-invalid={fieldErrors.customPlaybackUrl ? true : undefined}
                aria-describedby={
                  fieldErrors.customPlaybackUrl
                    ? 'catalog-form-custom-playback-url-error'
                    : undefined
                }
                disabled={saving}
                placeholder="https://example.com/movie"
              />
              {fieldErrors.customPlaybackUrl ? (
                <p
                  id="catalog-form-custom-playback-url-error"
                  className="riffsync-admin-form-field-error"
                  role="alert"
                >
                  {fieldErrors.customPlaybackUrl}
                </p>
              ) : null}
            </div>
          )}
        </fieldset>

        <fieldset className="riffsync-admin-form-section">
          <legend>Featured on home page</legend>
          <div className="riffsync-admin-form-field riffsync-admin-form-field--checkbox">
            <input
              id="catalog-form-carousel"
              name="carousel"
              type="checkbox"
              checked={values.carousel}
              onChange={(e) => setField('carousel', e.target.checked)}
              disabled={saving}
            />
            <label htmlFor="catalog-form-carousel">Show on home hero carousel</label>
          </div>
          <div className="riffsync-admin-form-field riffsync-admin-form-field--checkbox">
            <input
              id="catalog-form-spotlight"
              name="spotlight"
              type="checkbox"
              checked={values.spotlight}
              onChange={(e) => setField('spotlight', e.target.checked)}
              disabled={saving}
            />
            <label htmlFor="catalog-form-spotlight">Feature in spotlight carousel</label>
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

        <fieldset className="riffsync-admin-form-section">
          <legend>Operator hints</legend>
          <p className="riffsync-admin-form-section-helper">{OPERATOR_HINTS_HELPER}</p>

          <div className="riffsync-admin-form-field">
            <label htmlFor="catalog-form-movie-search-title">Movie search title</label>
            <input
              id="catalog-form-movie-search-title"
              name="movieSearchTitle"
              type="text"
              value={values.movieSearchTitle}
              onChange={(e) => setField('movieSearchTitle', e.target.value)}
              aria-invalid={fieldErrors.movieSearchTitle ? true : undefined}
              aria-describedby={
                fieldErrors.movieSearchTitle
                  ? 'catalog-form-movie-search-title-error'
                  : 'catalog-form-movie-search-title-helper'
              }
              disabled={saving}
              placeholder="Leave empty to clear"
            />
            <p id="catalog-form-movie-search-title-helper" className="riffsync-admin-form-field-helper">
              Override TMDB search title when reconcile has no movie id lock.
            </p>
            {fieldErrors.movieSearchTitle ? (
              <p
                id="catalog-form-movie-search-title-error"
                className="riffsync-admin-form-field-error"
                role="alert"
              >
                {fieldErrors.movieSearchTitle}
              </p>
            ) : null}
          </div>

          <div className="riffsync-admin-form-field">
            <label htmlFor="catalog-form-tmdb-movie-id">TMDB movie id</label>
            <input
              id="catalog-form-tmdb-movie-id"
              name="tmdbMovieId"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={values.tmdbMovieId}
              onChange={(e) => setField('tmdbMovieId', e.target.value)}
              aria-invalid={fieldErrors.tmdbMovieId ? true : undefined}
              aria-describedby={
                fieldErrors.tmdbMovieId
                  ? 'catalog-form-tmdb-movie-id-error'
                  : 'catalog-form-tmdb-movie-id-helper'
              }
              disabled={saving}
              placeholder="Leave empty to clear"
            />
            <p id="catalog-form-tmdb-movie-id-helper" className="riffsync-admin-form-field-helper">
              Pin the TMDB movie id from themoviedb.org. Reconcile fetches poster and tagline from
              this id and skips title search.
            </p>
            {fieldErrors.tmdbMovieId ? (
              <p
                id="catalog-form-tmdb-movie-id-error"
                className="riffsync-admin-form-field-error"
                role="alert"
              >
                {fieldErrors.tmdbMovieId}
              </p>
            ) : null}
          </div>

          <div className="riffsync-admin-form-field riffsync-admin-form-field--checkbox">
            <input
              id="catalog-form-embed-allows"
              name="embedAllows"
              type="checkbox"
              checked={values.embedAllows}
              onChange={(e) => setField('embedAllows', e.target.checked)}
              disabled={saving}
            />
            <label htmlFor="catalog-form-embed-allows">Allow in-app YouTube embed</label>
          </div>
          {!values.embedAllows ? (
            <p className="riffsync-admin-form-embed-note" role="note">
              In-app embed is disabled for this episode.
            </p>
          ) : null}

          {showTmdbNeedsReview && episode ? (
            <ReadOnlyField
              label="TMDB needs review"
              value={episode.tmdbNeedsReview ? 'Yes' : 'No'}
            />
          ) : null}
        </fieldset>

        <div className="riffsync-admin-catalog-form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save episode'}
          </button>
          <Link to="/admin/catalog" className="btn btn-secondary riffsync-admin-catalog-form-cancel">
            Cancel
          </Link>
        </div>
      </form>

      {mode === 'edit' && episode ? (
        <AdminCatalogDeleteControl
          episodeId={episode.id}
          onEpisodeNotFound={() => setEpisodeNotFound(true)}
        />
      ) : null}
    </div>
  )
}
