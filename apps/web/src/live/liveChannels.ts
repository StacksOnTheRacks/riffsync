import type { LiveChannelSnapshot } from '../api/liveApi'
import { CATALOG_VIDEO_PLACEHOLDER_IMAGE_URL } from '../catalog/mockCatalog'

/** Hub tab under Live Now. Reserved so it is not treated as a channel slug. */
export const LIVE_NOW_WATCH_PARTIES_PATH = '/live/watch-parties'

const LIVE_NOW_RESERVED_SLUGS = new Set(['watch-parties'])

/** Official Live channels use the catalog episode id as the public slug. */
export function getLivePathForEpisodeId(episodeId: string): string | undefined {
  const trimmed = episodeId.trim()
  if (!trimmed) return undefined
  return `/live/${encodeURIComponent(trimmed)}`
}

export function officialLiveSlugFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/live\/([^/]+)$/)
  if (!match) return undefined
  const slug = decodeURIComponent(match[1])
  if (LIVE_NOW_RESERVED_SLUGS.has(slug)) return undefined
  return slug
}

/** Same YouTube still catalog cards use when a channel has no dedicated poster. */
export function youtubeHqThumbnailUrl(videoId: string | null | undefined): string | undefined {
  const trimmed = videoId?.trim()
  if (!trimmed) return undefined
  return `https://img.youtube.com/vi/${trimmed}/hqdefault.jpg`
}

/**
 * Landscape art for Live Now stream cards: YouTube still first (16:9),
 * then catalog backdrop/poster, then the generic video placeholder.
 */
export function liveChannelCardImageUrl(
  channel: Pick<LiveChannelSnapshot, 'youtubeVideoId' | 'posterImageUrl' | 'backdropImageUrl'>,
): string {
  return (
    youtubeHqThumbnailUrl(channel.youtubeVideoId) ||
    channel.backdropImageUrl?.trim() ||
    channel.posterImageUrl?.trim() ||
    CATALOG_VIDEO_PLACEHOLDER_IMAGE_URL
  )
}
