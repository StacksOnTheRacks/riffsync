import type { CatalogEpisode } from './catalogTypes'
import { parseYoutubeWatchUrl } from './youtubeUrl'

const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

export function episodeAllowsInAppEmbed(ep: Pick<CatalogEpisode, 'embedAllows'>): boolean {
  return ep.embedAllows !== false
}

export function resolveCatalogYoutubeWatchUrl(
  ep: Pick<CatalogEpisode, 'youtubeWatchUrl' | 'youtubeVideoId'>,
): string | null {
  const parsedWatchUrl = ep.youtubeWatchUrl ? parseYoutubeWatchUrl(ep.youtubeWatchUrl) : null
  if (parsedWatchUrl) return parsedWatchUrl.canonicalWatchUrl

  const videoId = ep.youtubeVideoId?.trim()
  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) return null

  return `https://www.youtube.com/watch?v=${videoId}`
}

export function openCatalogYoutubeWatch(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}
