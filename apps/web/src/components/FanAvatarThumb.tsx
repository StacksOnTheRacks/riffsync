import { useState } from 'react'
import { avatarInitialFromDisplayName, isHttpsAvatarUrl } from './fanAvatarDisplay'

export type FanAvatarThumbProps = {
  displayName: string
  avatarUrl?: string | null
  sizePx?: number
}

export function FanAvatarThumb({ displayName, avatarUrl, sizePx = 28 }: FanAvatarThumbProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const initial = avatarInitialFromDisplayName(displayName)
  const showImage = isHttpsAvatarUrl(avatarUrl) && !imageFailed

  const sizeStyle = { width: sizePx, height: sizePx, fontSize: Math.max(10, Math.round(sizePx * 0.42)) }

  if (showImage) {
    return (
      <img
        className="riffsync-fan-avatar-thumb riffsync-fan-avatar-thumb--img"
        src={avatarUrl.trim()}
        alt={displayName}
        width={sizePx}
        height={sizePx}
        loading="lazy"
        referrerPolicy="no-referrer"
        style={sizeStyle}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <span
      className="riffsync-fan-avatar-thumb riffsync-fan-avatar-thumb--initials"
      aria-hidden
      style={sizeStyle}
    >
      {initial}
    </span>
  )
}
