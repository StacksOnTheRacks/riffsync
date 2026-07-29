import { CATALOG_CATEGORIES, type CatalogCategory } from './catalogTypes'
import { parseYoutubeWatchUrl } from './youtubeUrl'

const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
export type CatalogEpisodeFormMode = 'create' | 'edit'

export type CatalogPlaybackHost = 'youtube' | 'custom'

export type CatalogEpisodeFormValues = {
  id: string
  experimentNumber: string
  title: string
  catalog: CatalogCategory
  tags: string[]
  labels: string[]
  playbackHost: CatalogPlaybackHost
  youtubeWatchUrl: string
  customPlaybackUrl: string
  carousel: boolean
  spotlight: boolean
  movieSearchTitle: string
  tmdbMovieId: string
  embedAllows: boolean
}

const MOVIE_SEARCH_TITLE_MAX_LENGTH = 256
const CUSTOM_PLAYBACK_URL_MAX_LENGTH = 2048
const CUSTOM_PLAYBACK_URL_ERROR =
  'customPlaybackUrl must be an HTTPS URL (max 2048 characters)'
const TAG_MAX_COUNT = 32
const TAG_MAX_LENGTH = 64
const LABEL_MAX_COUNT = 8
const LABEL_MAX_LENGTH = 32

export type CatalogEpisodeFormValidation = {
  fieldErrors: Record<string, string>
  formError?: string
}

export const EMPTY_CATALOG_EPISODE_FORM_VALUES: CatalogEpisodeFormValues = {
  id: '',
  experimentNumber: '',
  title: '',
  catalog: 'other',
  tags: [],
  labels: [],
  playbackHost: 'youtube',
  youtubeWatchUrl: '',
  customPlaybackUrl: '',
  carousel: false,
  spotlight: false,
  movieSearchTitle: '',
  tmdbMovieId: '',
  embedAllows: true,
}

function validateSlug(id: string): string | undefined {
  const trimmed = id.trim()
  if (!trimmed) return 'Episode id is required.'
  if (!SLUG_PATTERN.test(trimmed)) {
    return 'Use lowercase letters, numbers, and hyphens (no leading or trailing hyphen).'
  }
  return undefined
}

function validateExperimentNumber(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return 'Experiment number is required.'
  if (!/^\d+$/.test(trimmed)) return 'Enter a whole number (0 or greater).'
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(n) || n < 0) return 'Enter a whole number (0 or greater).'
  return undefined
}

function validateTitle(title: string, mode: CatalogEpisodeFormMode): string | undefined {
  const trimmed = title.trim()
  if (!trimmed) {
    return mode === 'create' ? 'Title is required.' : 'Title cannot be empty.'
  }
  return undefined
}

function validateCatalog(catalog: string): string | undefined {
  if (!(CATALOG_CATEGORIES as readonly string[]).includes(catalog)) {
    return 'Choose a valid catalog.'
  }
  return undefined
}

function validateYoutubeWatchUrl(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (!parseYoutubeWatchUrl(trimmed)) {
    return 'Enter a valid YouTube watch URL or leave empty.'
  }
  return undefined
}

export function normalizeCustomPlaybackUrlField(raw: string): string | null {
  const normalized = raw.normalize('NFC').trim()
  return normalized.length > 0 ? normalized : null
}

function validateCustomPlaybackUrl(raw: string): string | undefined {
  const normalized = raw.normalize('NFC').trim()
  if (!normalized) return CUSTOM_PLAYBACK_URL_ERROR
  if (normalized.length > CUSTOM_PLAYBACK_URL_MAX_LENGTH) return CUSTOM_PLAYBACK_URL_ERROR
  try {
    const url = new URL(normalized)
    if (url.protocol !== 'https:') return CUSTOM_PLAYBACK_URL_ERROR
  } catch {
    return CUSTOM_PLAYBACK_URL_ERROR
  }
  return undefined
}

export function normalizeNullableTextField(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeStringListField(values: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }
  return normalized
}

function validateMovieSearchTitle(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MOVIE_SEARCH_TITLE_MAX_LENGTH) {
    return `Movie search title must be ${MOVIE_SEARCH_TITLE_MAX_LENGTH} characters or fewer.`
  }
  return undefined
}

function validateTmdbMovieId(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (!/^\d+$/.test(trimmed)) return 'Enter a positive TMDB movie id or leave empty.'
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(n) || n < 1) return 'Enter a positive TMDB movie id or leave empty.'
  return undefined
}

export function normalizeTmdbMovieIdField(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  return Number.isInteger(n) && n >= 1 ? n : null
}

function validateStringList(
  values: string[],
  label: string,
  maxCount: number,
  maxLength: number,
): string | undefined {
  const normalized = normalizeStringListField(values)
  if (normalized.length > maxCount) {
    return `${label} must include ${maxCount} entries or fewer.`
  }
  for (const value of normalized) {
    if (value.length > maxLength) {
      return `${label} entries must be ${maxLength} characters or fewer.`
    }
  }
  return undefined
}

export function validateCatalogEpisodeForm(
  values: CatalogEpisodeFormValues,
  mode: CatalogEpisodeFormMode,
): CatalogEpisodeFormValidation {
  const fieldErrors: Record<string, string> = {}

  if (mode === 'create') {
    const idError = validateSlug(values.id)
    if (idError) fieldErrors.id = idError
  }

  const experimentError = validateExperimentNumber(values.experimentNumber)
  if (experimentError) fieldErrors.experimentNumber = experimentError

  const titleError = validateTitle(values.title, mode)
  if (titleError) fieldErrors.title = titleError

  const catalogError = validateCatalog(values.catalog)
  if (catalogError) fieldErrors.catalog = catalogError

  const watchUrlError = validateYoutubeWatchUrl(values.youtubeWatchUrl)
  if (watchUrlError) fieldErrors.youtubeWatchUrl = watchUrlError

  if (values.playbackHost === 'custom') {
    const customUrlError = validateCustomPlaybackUrl(values.customPlaybackUrl)
    if (customUrlError) fieldErrors.customPlaybackUrl = customUrlError
  }

  const tagsError = validateStringList(values.tags, 'Tags', TAG_MAX_COUNT, TAG_MAX_LENGTH)
  if (tagsError) fieldErrors.tags = tagsError

  const labelsError = validateStringList(values.labels, 'Labels', LABEL_MAX_COUNT, LABEL_MAX_LENGTH)
  if (labelsError) fieldErrors.labels = labelsError

  const movieSearchTitleError = validateMovieSearchTitle(values.movieSearchTitle)
  if (movieSearchTitleError) fieldErrors.movieSearchTitle = movieSearchTitleError

  const tmdbMovieIdError = validateTmdbMovieId(values.tmdbMovieId)
  if (tmdbMovieIdError) fieldErrors.tmdbMovieId = tmdbMovieIdError

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      formError: 'Fix the highlighted fields before saving.',
    }
  }

  return { fieldErrors }
}

export function mapValidationDetailsToFieldErrors(
  details: Array<{ instancePath: string; message?: string }>,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {}
  for (const detail of details) {
    const key = detail.instancePath.replace(/^\//, '') || 'form'
    if (!fieldErrors[key]) {
      fieldErrors[key] =
        detail.message ??
        (key === 'id' ? 'Episode id is invalid.' : 'This value is not valid.')
    }
  }
  return fieldErrors
}

export function catalogEpisodeToFormValues(
  entry: {
    id: string
    experimentNumber: number
    title: string
    catalog: CatalogCategory
    tags?: string[] | null
    labels?: string[] | null
    youtubeVideoId: string | null
    youtubeWatchUrl: string | null
    playbackHost?: CatalogPlaybackHost | null
    customPlaybackUrl?: string | null
    carousel: boolean
    spotlight?: boolean
    movieSearchTitle?: string | null
    tmdbMovieId?: number | null
    embedAllows?: boolean | null
  },
): CatalogEpisodeFormValues {
  return {
    id: entry.id,
    experimentNumber: String(entry.experimentNumber),
    title: entry.title,
    catalog: entry.catalog,
    tags: entry.tags ?? [],
    labels: entry.labels ?? [],
    playbackHost: entry.playbackHost === 'custom' ? 'custom' : 'youtube',
    youtubeWatchUrl: entry.youtubeWatchUrl ?? '',
    customPlaybackUrl: entry.customPlaybackUrl ?? '',
    carousel: entry.carousel,
    spotlight: entry.spotlight === true,
    movieSearchTitle: entry.movieSearchTitle ?? '',
    tmdbMovieId: entry.tmdbMovieId != null ? String(entry.tmdbMovieId) : '',
    embedAllows: entry.embedAllows !== false,
  }
}
