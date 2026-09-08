import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { getPublicOrigin } from '../../config/publicOrigin'

export interface WatchPartyCardProps {
  roomId: string
  displayTitle: string
  onCopyUrl?: () => void
}

export function WatchPartyCard({ roomId, displayTitle, onCopyUrl }: WatchPartyCardProps) {
  const roomPath = `/room/${roomId}`
  const joinUrl = `${getPublicOrigin()}${roomPath}`

  async function handleCopyUrl(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(joinUrl)
      onCopyUrl?.()
    } catch {
      // Clipboard may be unavailable in some test environments.
    }
  }

  return (
    <article className="riffsync-watch-party-card" aria-label={displayTitle}>
      <Link to={roomPath} className="riffsync-watch-party-card__title-link">
        <h2 className="riffsync-watch-party-card__title">{displayTitle}</h2>
      </Link>
      <Link to={roomPath} className="riffsync-watch-party-card__join-link">
        {joinUrl}
      </Link>
      <button type="button" className="riffsync-watch-party-card__copy" onClick={handleCopyUrl}>
        Copy URL
      </button>
    </article>
  )
}
