import type { CatalogEra } from './catalogTypes'

const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/
const CATALOG_ERAS: readonly CatalogEra[] = ['joel', 'mike', 'jonah', 'emily', 'other']

export type CatalogEpisodeFormMode = 'create' | 'edit'

export type CatalogEpisodeFormValues = {
  id: string
  experimentNumber: string
  title: string
  era: CatalogEra
  youtubeVideoId: string
  youtubeWatchUrl: string
  carousel: boolean
}

export type CatalogEpisodeFormValidation = {
  fieldErrors: Record<string, string>
  formError?: string
}

export const EMPTY_CATALOG_EPISODE_FORM_VALUES: CatalogEpisodeFormValues = {
  id: '',
  experimentNumber: '',
  title: '',
  era: 'other',
  youtubeVideoId: '',
  youtubeWatchUrl: '',
  carousel: false,
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
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

function validateEra(era: string): string | undefined {
  if (!(CATALOG_ERAS as readonly string[]).includes(era)) {
    return 'Choose a valid era.'
  }
  return undefined
}

function validateYoutubeVideoId(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(trimmed)) {
    return 'Enter an 11-character YouTube video id or leave empty.'
  }
  return undefined
}

function validateYoutubeWatchUrl(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (!isValidHttpUrl(trimmed)) {
    return 'Enter a valid http or https URL or leave empty.'
  }
  return undefined
}

export function normalizeYoutubeField(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
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

  const eraError = validateEra(values.era)
  if (eraError) fieldErrors.era = eraError

  const videoIdError = validateYoutubeVideoId(values.youtubeVideoId)
  if (videoIdError) fieldErrors.youtubeVideoId = videoIdError

  const watchUrlError = validateYoutubeWatchUrl(values.youtubeWatchUrl)
  if (watchUrlError) fieldErrors.youtubeWatchUrl = watchUrlError

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
    era: CatalogEra
    youtubeVideoId: string | null
    youtubeWatchUrl: string | null
    carousel: boolean
  },
): CatalogEpisodeFormValues {
  return {
    id: entry.id,
    experimentNumber: String(entry.experimentNumber),
    title: entry.title,
    era: entry.era,
    youtubeVideoId: entry.youtubeVideoId ?? '',
    youtubeWatchUrl: entry.youtubeWatchUrl ?? '',
    carousel: entry.carousel,
  }
}
