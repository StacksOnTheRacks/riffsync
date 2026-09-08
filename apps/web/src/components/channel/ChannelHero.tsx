import type { ReactNode } from 'react'

export interface ChannelHeroProps {
  coverUrl: string
  avatarUrl: string
  visualTitle: string
  subtitle?: ReactNode
  /** When set to h1, the visual title is the page heading (Your Parties). */
  visualTitleAs?: 'h1' | 'p'
}

export function ChannelHero({
  coverUrl,
  avatarUrl,
  visualTitle,
  subtitle,
  visualTitleAs = 'p',
}: ChannelHeroProps) {
  const TitleTag = visualTitleAs
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
          <TitleTag className="riffsync-channel-hero__visual-title">{visualTitle}</TitleTag>
          {subtitle ? <p className="riffsync-channel-hero__subtitle">{subtitle}</p> : null}
        </div>
      </div>
    </header>
  )
}
