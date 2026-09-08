import type { ReactNode } from 'react'

export const MST3K_CHANNEL_COVER_URL = '/channel/mst3k/cover.svg'
export const MST3K_CHANNEL_AVATAR_URL = '/channel/mst3k/avatar.svg'
export const MST3K_CHANNEL_VISUAL_TITLE = 'Mystery Science Theater 3000'

export const TV_SHOWS_CHANNEL_COVER_URL = '/channel/tv-shows/cover.svg'
export const TV_SHOWS_CHANNEL_AVATAR_URL = '/channel/tv-shows/avatar.svg'
export const TV_SHOWS_CHANNEL_VISUAL_TITLE = 'TV Shows'

export const MOVIES_CHANNEL_COVER_URL = '/channel/movies/cover.svg'
export const MOVIES_CHANNEL_AVATAR_URL = '/channel/movies/avatar.svg'
export const MOVIES_CHANNEL_VISUAL_TITLE = 'Movies'

export type ChannelLayoutSlug = 'mst3k' | 'tv-shows' | 'movies'

export interface ChannelSurfaceConfig {
  srOnlyHeading: string
  coverUrl: string
  avatarUrl: string
  visualTitle: string
}

export const CHANNEL_SURFACE_CONFIG: Record<ChannelLayoutSlug, ChannelSurfaceConfig> = {
  mst3k: {
    srOnlyHeading: 'MST3K',
    coverUrl: MST3K_CHANNEL_COVER_URL,
    avatarUrl: MST3K_CHANNEL_AVATAR_URL,
    visualTitle: MST3K_CHANNEL_VISUAL_TITLE,
  },
  'tv-shows': {
    srOnlyHeading: 'TV Shows',
    coverUrl: TV_SHOWS_CHANNEL_COVER_URL,
    avatarUrl: TV_SHOWS_CHANNEL_AVATAR_URL,
    visualTitle: TV_SHOWS_CHANNEL_VISUAL_TITLE,
  },
  movies: {
    srOnlyHeading: 'Movies',
    coverUrl: MOVIES_CHANNEL_COVER_URL,
    avatarUrl: MOVIES_CHANNEL_AVATAR_URL,
    visualTitle: MOVIES_CHANNEL_VISUAL_TITLE,
  },
}

export function getChannelSurfaceConfig(slug: string): ChannelSurfaceConfig | undefined {
  if (slug === 'mst3k' || slug === 'tv-shows' || slug === 'movies') {
    return CHANNEL_SURFACE_CONFIG[slug]
  }
  return undefined
}

export interface ChannelHeroProps {
  coverUrl: string
  avatarUrl: string
  visualTitle: string
  subtitle?: ReactNode
}

export function ChannelHero({ coverUrl, avatarUrl, visualTitle, subtitle }: ChannelHeroProps) {
  return (
    <header className="riffsync-channel-hero">
      <div className="riffsync-channel-hero__cover">
        <img src={coverUrl} alt="" className="riffsync-channel-hero__cover-image" />
      </div>
      <div className="riffsync-channel-hero__identity">
        <img
          src={avatarUrl}
          alt=""
          className="riffsync-channel-hero__avatar"
          width={80}
          height={80}
        />
        <div className="riffsync-channel-hero__titles">
          <p className="riffsync-channel-hero__visual-title">{visualTitle}</p>
          {subtitle ? <p className="riffsync-channel-hero__subtitle">{subtitle}</p> : null}
        </div>
      </div>
    </header>
  )
}
