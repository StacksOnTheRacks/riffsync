import { getPublicApiBaseUrl } from '../config/apiBaseUrl'

export type LiveChannelSnapshot = {
  slug: string
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

export async function fetchLiveChannel(slug: string): Promise<LiveChannelSnapshot> {
  const base = getPublicApiBaseUrl()
  if (!base) {
    throw new Error('API base URL is not configured')
  }
  const res = await fetch(`${base}/v1/live/${encodeURIComponent(slug)}`)
  if (!res.ok) {
    let message = `Live channel unavailable (${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (typeof body.error === 'string' && body.error.trim() !== '') {
        message = body.error
      }
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return (await res.json()) as LiveChannelSnapshot
}
