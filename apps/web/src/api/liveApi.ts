import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

export type LiveChannelSnapshot = {
  slug: string
  path: string
  roomId: string
  catalogEpisodeId: string
  enabled: boolean
  title: string
  tagline: string | null
  posterImageUrl: string | null
  backdropImageUrl: string | null
  youtubeVideoId: string | null
  youtubeWatchUrl: string | null
  embedAllows: boolean
  playbackHost: 'youtube' | 'custom'
}

export type LiveChannelsResponse = {
  version: 1
  channels: LiveChannelSnapshot[]
}

async function liveApiError(res: Response, fallback: string): Promise<Error> {
  let message = fallback
  try {
    const body = (await res.json()) as { error?: string }
    if (typeof body.error === 'string' && body.error.trim() !== '') {
      message = body.error
    }
  } catch {
    /* ignore */
  }
  return new Error(message)
}

export async function fetchLiveChannels(): Promise<LiveChannelsResponse> {
  const base = getPublicApiBaseUrl()
  if (!base) {
    throw new Error('API base URL is not configured')
  }
  const res = await fetch(`${base}/v1/live`)
  if (!res.ok) {
    throw await liveApiError(res, `Live channels unavailable (${res.status})`)
  }
  return (await res.json()) as LiveChannelsResponse
}

export async function fetchLiveChannel(slug: string): Promise<LiveChannelSnapshot> {
  const base = getPublicApiBaseUrl()
  if (!base) {
    throw new Error('API base URL is not configured')
  }
  const res = await fetch(`${base}/v1/live/${encodeURIComponent(slug)}`)
  if (!res.ok) {
    throw await liveApiError(res, `Live channel unavailable (${res.status})`)
  }
  return (await res.json()) as LiveChannelSnapshot
}
