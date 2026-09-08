import type { ReactNode } from 'react'

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
