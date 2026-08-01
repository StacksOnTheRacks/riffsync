/**
 * Seeded official Live channel registry (server).
 * catalogEpisodeId may be overridden per channel via env LIVE_CHANNEL_<SLUG>_EPISODE_ID
 * (slug uppercased with hyphens → underscores), e.g. LIVE_CHANNEL_MST3K_FOREVER_A_THON_EPISODE_ID.
 */

export type LiveChannelRecord = {
  readonly slug: string;
  readonly catalogEpisodeId: string;
  readonly roomId: string;
  readonly enabled: boolean;
  readonly defaultTitle: string;
};

const SEED: readonly Omit<LiveChannelRecord, 'catalogEpisodeId'>[] = [
  {
    slug: 'mst3k-forever-a-thon',
    roomId: 'live-mst3k-forever-a-thon',
    enabled: true,
    defaultTitle: 'MST3K Forever-A-Thon',
  },
];

/** Sentinel hostSub so WS connect accepts the room; no Cognito principal matches. */
export const LIVE_SYSTEM_HOST_SUB = 'system:live';

function envEpisodeIdForSlug(slug: string): string | undefined {
  const key = `LIVE_CHANNEL_${slug.toUpperCase().replace(/-/g, '_')}_EPISODE_ID`;
  const raw = process.env[key];
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  return undefined;
}

export function listLiveChannels(): LiveChannelRecord[] {
  return SEED.map((row) => ({
    ...row,
    catalogEpisodeId: envEpisodeIdForSlug(row.slug) ?? row.slug,
  }));
}

export function getLiveChannel(slug: string): LiveChannelRecord | undefined {
  const trimmed = slug.trim();
  if (!trimmed) return undefined;
  return listLiveChannels().find((c) => c.slug === trimmed);
}
