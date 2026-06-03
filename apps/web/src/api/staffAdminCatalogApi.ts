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
