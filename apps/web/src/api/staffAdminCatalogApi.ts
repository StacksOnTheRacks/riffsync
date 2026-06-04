import { getPublicApiBaseUrl } from '../config/apiBaseUrl'
import {
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
} from './staffAdminSessionApi'

export interface StaffCatalogEpisode {
  id: string
  experimentNumber: number
  title: string
  era: 'joel' | 'mike' | 'jonah' | 'emily' | 'other'
  youtubeVideoId: string | null
  youtubeWatchUrl: string | null
  tagline: string | null
  posterImageUrl: string | null
  backdropImageUrl: string | null
  tmdbMovieId: number | null
  tmdbArtworkSyncedAt: string | null
  carousel: boolean
  tmdbOverview?: string | null
  tmdbPopularity?: number | null
  tmdbPosterPath?: string | null
  tmdbBackdropPath?: string | null
  movieSearchTitle: string | null
  embedAllows: boolean | null
  curatorNotes: string | null
  tmdbNeedsReview?: boolean | null
  youtubeThumbnailUrl: string | null
}

export interface StaffCatalogListResponse {
  version: number
  entries: StaffCatalogEpisode[]
}

export interface StaffCatalogEpisodeResponse {
  entry: StaffCatalogEpisode
}

export interface StaffCatalogEpisodeWrite {
  experimentNumber?: number
  title?: string
  era?: StaffCatalogEpisode['era']
  youtubeVideoId?: string | null
  youtubeWatchUrl?: string | null
  carousel?: boolean
  movieSearchTitle?: string | null
  embedAllows?: boolean
  curatorNotes?: string | null
}

export class StaffCatalogValidationError extends Error {
  readonly statusCode = 400
  readonly code = 'validation_error'
  readonly details: Array<{ instancePath: string; message?: string }>

  constructor(details: Array<{ instancePath: string; message?: string }>) {
    super('Catalog validation failed')
    this.name = 'StaffCatalogValidationError'
    this.details = details
  }
}

export class StaffCatalogEpisodeConflictError extends Error {
  readonly statusCode = 409
  readonly code = 'catalog_episode_exists'

  constructor() {
    super('An episode with this id already exists.')
    this.name = 'StaffCatalogEpisodeConflictError'
  }
}

export class StaffCatalogEpisodeNotFoundError extends Error {
  readonly statusCode = 404

  constructor() {
    super('Episode not found.')
    this.name = 'StaffCatalogEpisodeNotFoundError'
  }
}

export class StaffCatalogEpisodeInUseError extends Error {
  readonly statusCode = 409
  readonly code = 'catalog_episode_in_use'
  readonly references: { rooms: number; lists: number }

  constructor(references: { rooms: number; lists: number }) {
    super('Episode is referenced by rooms or lists and cannot be deleted.')
    this.name = 'StaffCatalogEpisodeInUseError'
    this.references = references
  }
}

function staffCatalogJsonHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function mapStaffCatalogWriteError(res: Response): Promise<never> {
  if (res.status === 401) {
    throw new StaffSessionUnauthorizedError()
  }
  if (res.status === 403) {
    let detail = 'Staff group required — contact an administrator'
    try {
      const parsed = (await res.json()) as { code?: string; error?: string }
      if (parsed.code === 'staff_group_required' || parsed.error === 'Forbidden') {
        detail = 'Staff group required — contact an administrator'
      }
    } catch {
      /* use default copy */
    }
    throw new StaffSessionForbiddenError(detail)
  }
  if (res.status === 409) {
    throw new StaffCatalogEpisodeConflictError()
  }
  if (res.status === 400) {
    try {
      const parsed = (await res.json()) as {
        code?: string
        details?: Array<{ instancePath: string; message?: string }>
      }
      if (parsed.code === 'validation_error' && Array.isArray(parsed.details)) {
        throw new StaffCatalogValidationError(parsed.details)
      }
    } catch (err) {
      if (err instanceof StaffCatalogValidationError) {
        throw err
      }
    }
  }
  const t = await res.text()
  throw new Error(`Staff catalog write failed (${res.status}): ${t}`)
}

export async function createStaffCatalogEpisode(
  accessToken: string,
  id: string,
  body: StaffCatalogEpisodeWrite,
): Promise<StaffCatalogEpisodeResponse> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const encodedId = encodeURIComponent(id)
  const res = await fetch(`${base}/v1/admin/catalog/episodes/${encodedId}`, {
    method: 'POST',
    headers: staffCatalogJsonHeaders(accessToken),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    await mapStaffCatalogWriteError(res)
  }
  return (await res.json()) as StaffCatalogEpisodeResponse
}

export async function patchStaffCatalogEpisode(
  accessToken: string,
  id: string,
  body: StaffCatalogEpisodeWrite,
): Promise<StaffCatalogEpisodeResponse> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const encodedId = encodeURIComponent(id)
  const res = await fetch(`${base}/v1/admin/catalog/episodes/${encodedId}`, {
    method: 'PATCH',
    headers: staffCatalogJsonHeaders(accessToken),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    await mapStaffCatalogWriteError(res)
  }
  return (await res.json()) as StaffCatalogEpisodeResponse
}

export async function deleteStaffCatalogEpisode(
  accessToken: string,
  id: string,
): Promise<void> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const encodedId = encodeURIComponent(id)
  const res = await fetch(`${base}/v1/admin/catalog/episodes/${encodedId}`, {
    method: 'DELETE',
    headers: staffCatalogAuthHeaders(accessToken),
  })
  if (res.status === 204) {
    return
  }
  if (res.status === 401) {
    throw new StaffSessionUnauthorizedError()
  }
  if (res.status === 403) {
    let detail = 'Staff group required — contact an administrator'
    try {
      const parsed = (await res.json()) as { code?: string; error?: string }
      if (parsed.code === 'staff_group_required' || parsed.error === 'Forbidden') {
        detail = 'Staff group required — contact an administrator'
      }
    } catch {
      /* use default copy */
    }
    throw new StaffSessionForbiddenError(detail)
  }
  if (res.status === 404) {
    throw new StaffCatalogEpisodeNotFoundError()
  }
  if (res.status === 409) {
    try {
      const parsed = (await res.json()) as {
        code?: string
        references?: { rooms?: number; lists?: number }
      }
      if (parsed.code === 'catalog_episode_in_use') {
        throw new StaffCatalogEpisodeInUseError({
          rooms: parsed.references?.rooms ?? 0,
          lists: parsed.references?.lists ?? 0,
        })
      }
    } catch (err) {
      if (err instanceof StaffCatalogEpisodeInUseError) {
        throw err
      }
    }
  }
  const t = await res.text()
  throw new Error(`Staff catalog delete failed (${res.status}): ${t}`)
}

function staffCatalogAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }
}

async function mapStaffCatalogError(res: Response): Promise<never> {
  if (res.status === 401) {
    throw new StaffSessionUnauthorizedError()
  }
  if (res.status === 403) {
    let detail = 'Staff group required — contact an administrator'
    try {
      const parsed = (await res.json()) as { code?: string; error?: string }
      if (parsed.code === 'staff_group_required' || parsed.error === 'Forbidden') {
        detail = 'Staff group required — contact an administrator'
      }
    } catch {
      /* use default copy */
    }
    throw new StaffSessionForbiddenError(detail)
  }
  if (res.status === 404) {
    throw new StaffCatalogEpisodeNotFoundError()
  }
  const t = await res.text()
  throw new Error(`Staff catalog read failed (${res.status}): ${t}`)
}

export async function fetchStaffCatalogList(
  accessToken: string,
): Promise<StaffCatalogListResponse> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const res = await fetch(`${base}/v1/admin/catalog`, {
    headers: staffCatalogAuthHeaders(accessToken),
  })
  if (!res.ok) {
    await mapStaffCatalogError(res)
  }
  return (await res.json()) as StaffCatalogListResponse
}

export async function fetchStaffCatalogEpisode(
  accessToken: string,
  id: string,
): Promise<StaffCatalogEpisodeResponse> {
  const base = getPublicApiBaseUrl()
  if (!base) throw new Error('Configure VITE_PUBLIC_API_BASE_URL.')
  const encodedId = encodeURIComponent(id)
  const res = await fetch(`${base}/v1/admin/catalog/episodes/${encodedId}`, {
    headers: staffCatalogAuthHeaders(accessToken),
  })
  if (!res.ok) {
    await mapStaffCatalogError(res)
  }
  return (await res.json()) as StaffCatalogEpisodeResponse
}
