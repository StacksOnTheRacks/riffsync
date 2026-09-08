import type { ReactNode } from 'react'
import type { ChannelAvatarVariant } from './channelSurfaceConfig'

export interface ChannelHeroProps {
  coverUrl: string
  avatarUrl: string
  avatarVariant?: ChannelAvatarVariant
  visualTitle: string
  subtitle?: ReactNode
  /** When set to h1, the visual title is the page heading (Your Parties). */
  visualTitleAs?: 'h1' | 'p'
  toolbar?: ReactNode
}

export function ChannelHero({
  coverUrl,
  avatarUrl,
  avatarVariant = 'logo',
  visualTitle,
  subtitle,
  visualTitleAs = 'p',
  toolbar,
}: ChannelHeroProps) {
  const TitleTag = visualTitleAs
  return (
    <header className="riffsync-channel-hero">
      <div className="riffsync-channel-hero__cover">
        <img src={coverUrl} alt="" className="riffsync-channel-hero__cover-image" />
      </div>
      <div className="riffsync-channel-hero__identity">
        <span className={`riffsync-channel-hero__avatar riffsync-channel-hero__avatar--${avatarVariant}`}>
          <img src={avatarUrl} alt="" width={80} height={80} />
        </span>
        <div className="riffsync-channel-hero__titles">
          <TitleTag className="riffsync-channel-hero__visual-title">{visualTitle}</TitleTag>
          {subtitle ? <p className="riffsync-channel-hero__subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {toolbar ? <div className="riffsync-channel-hero__toolbar">{toolbar}</div> : null}
    </header>
  )
}
