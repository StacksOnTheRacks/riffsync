export type ChannelAvatarVariant = 'glyph' | 'logo' | 'wordmark'

export const MST3K_CHANNEL_COVER_URL = '/channel/mst3k/cover.svg'
export const MST3K_CHANNEL_AVATAR_URL = '/app-shell/sidebar/mst3k.jpg'
export const MST3K_CHANNEL_VISUAL_TITLE = 'Mystery Science Theater 3000'

export const TV_SHOWS_CHANNEL_COVER_URL = '/channel/tv-shows/cover.svg'
export const TV_SHOWS_CHANNEL_AVATAR_URL = '/app-shell/sidebar/tv-shows.svg'
export const TV_SHOWS_CHANNEL_VISUAL_TITLE = 'TV Shows'

export const MOVIES_CHANNEL_COVER_URL = '/channel/movies/cover.svg'
export const MOVIES_CHANNEL_AVATAR_URL = '/app-shell/sidebar/movies.svg'
export const MOVIES_CHANNEL_VISUAL_TITLE = 'Movies'

export const RIFFTRAX_CHANNEL_COVER_URL = '/channel/rifftrax/cover.svg'
export const RIFFTRAX_CHANNEL_AVATAR_URL = '/app-shell/sidebar/rifftrax.png'
export const RIFFTRAX_CHANNEL_VISUAL_TITLE = 'RiffTrax'

export const COMMUNITY_CHANNEL_COVER_URL = '/channel/community/cover.svg'
export const COMMUNITY_CHANNEL_AVATAR_URL = '/app-shell/sidebar/community.svg'
export const COMMUNITY_CHANNEL_VISUAL_TITLE = 'Community'

export const RIFF_MATERIAL_CHANNEL_COVER_URL = '/channel/riff-material/cover.svg'
export const RIFF_MATERIAL_CHANNEL_AVATAR_URL = '/app-shell/sidebar/riff-material.svg'
export const RIFF_MATERIAL_CHANNEL_VISUAL_TITLE = 'Riff Material'

export const LIVE_NOW_CHANNEL_COVER_URL = '/channel/live-now/cover.svg'
export const LIVE_NOW_CHANNEL_AVATAR_URL = '/app-shell/sidebar/live.svg'
export const LIVE_NOW_CHANNEL_VISUAL_TITLE = 'Live Now'

export type ChannelLayoutSlug =
  | 'mst3k'
  | 'tv-shows'
  | 'movies'
  | 'rifftrax'
  | 'community'
  | 'riff-material'

export interface ChannelSurfaceConfig {
  srOnlyHeading: string
  coverUrl: string
  avatarUrl: string
  avatarVariant: ChannelAvatarVariant
  visualTitle: string
}

export const CHANNEL_SURFACE_CONFIG: Record<ChannelLayoutSlug, ChannelSurfaceConfig> = {
  mst3k: {
    srOnlyHeading: 'MST3K',
    coverUrl: MST3K_CHANNEL_COVER_URL,
    avatarUrl: MST3K_CHANNEL_AVATAR_URL,
    avatarVariant: 'logo',
    visualTitle: MST3K_CHANNEL_VISUAL_TITLE,
  },
  'tv-shows': {
    srOnlyHeading: 'TV Shows',
    coverUrl: TV_SHOWS_CHANNEL_COVER_URL,
    avatarUrl: TV_SHOWS_CHANNEL_AVATAR_URL,
    avatarVariant: 'glyph',
    visualTitle: TV_SHOWS_CHANNEL_VISUAL_TITLE,
  },
  movies: {
    srOnlyHeading: 'Movies',
    coverUrl: MOVIES_CHANNEL_COVER_URL,
    avatarUrl: MOVIES_CHANNEL_AVATAR_URL,
    avatarVariant: 'glyph',
    visualTitle: MOVIES_CHANNEL_VISUAL_TITLE,
  },
  rifftrax: {
    srOnlyHeading: 'RiffTrax',
    coverUrl: RIFFTRAX_CHANNEL_COVER_URL,
    avatarUrl: RIFFTRAX_CHANNEL_AVATAR_URL,
    avatarVariant: 'wordmark',
    visualTitle: RIFFTRAX_CHANNEL_VISUAL_TITLE,
  },
  community: {
    srOnlyHeading: 'Community',
    coverUrl: COMMUNITY_CHANNEL_COVER_URL,
    avatarUrl: COMMUNITY_CHANNEL_AVATAR_URL,
    avatarVariant: 'glyph',
    visualTitle: COMMUNITY_CHANNEL_VISUAL_TITLE,
  },
  'riff-material': {
    srOnlyHeading: 'Riff Material',
    coverUrl: RIFF_MATERIAL_CHANNEL_COVER_URL,
    avatarUrl: RIFF_MATERIAL_CHANNEL_AVATAR_URL,
    avatarVariant: 'glyph',
    visualTitle: RIFF_MATERIAL_CHANNEL_VISUAL_TITLE,
  },
}

export function getChannelSurfaceConfig(slug: string): ChannelSurfaceConfig | undefined {
  if (slug in CHANNEL_SURFACE_CONFIG) {
    return CHANNEL_SURFACE_CONFIG[slug as ChannelLayoutSlug]
  }
  return undefined
}
