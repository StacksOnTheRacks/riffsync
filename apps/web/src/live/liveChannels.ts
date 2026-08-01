/**
 * Seeded official Live channel registry (v1).
 * Episode binding is resolved at runtime via GET /v1/live/{slug};
 * this module owns public slugs, default nav target, and SEO paths.
 */

export type LiveChannelSeed = {
  readonly slug: string
  readonly path: string
  readonly enabled: boolean
  /** Optional prerender/SEO title when episode fetch is unavailable at build time. */
  readonly defaultTitle: string
  readonly defaultDescription: string
}

export const LIVE_CHANNELS: readonly LiveChannelSeed[] = [
  {
    slug: 'mst3k-forever-a-thon',
    path: '/live/mst3k-forever-a-thon',
    enabled: true,
    defaultTitle: 'MST3K Forever-A-Thon',
    defaultDescription:
      'Watch the MST3K Forever-A-Thon live on RiffSync with room chat.',
  },
] as const

/** First/default enabled channel for main-nav Live. */
export const DEFAULT_LIVE_CHANNEL_PATH =
  LIVE_CHANNELS.find((c) => c.enabled)?.path ?? '/live/mst3k-forever-a-thon'

export function getLiveChannelSeed(slug: string): LiveChannelSeed | undefined {
  return LIVE_CHANNELS.find((c) => c.slug === slug)
}

export function enabledLiveChannelPaths(): string[] {
  return LIVE_CHANNELS.filter((c) => c.enabled).map((c) => c.path)
}

/**
 * v1: seeded channels default to catalogEpisodeId === slug.
 * When staff use a different episode id, set CDK/env binding on the API;
 * client redirect still keys off slug-shaped ids until registry CRUD ships.
 */
export function getLivePathForEpisodeId(episodeId: string): string | undefined {
  const trimmed = episodeId.trim()
  if (!trimmed) return undefined
  const seed = getLiveChannelSeed(trimmed)
  return seed?.enabled ? seed.path : undefined
}
