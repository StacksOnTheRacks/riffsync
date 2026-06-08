import { useEffect, useRef } from 'react'
import type { StageParticipantTile } from './stageParticipantTiles'

type ParticipantVideoTileProps = {
  tile: StageParticipantTile
}

export function ParticipantVideoTile({ tile }: ParticipantVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = tile.stream
    void el.play().catch(() => undefined)
    return () => {
      el.srcObject = null
    }
  }, [tile.stream])

  return (
    <figure
      className={`riffsync-room-page__participant-tile${tile.isSelf ? ' riffsync-room-page__participant-tile--self' : ''}`}
    >
      <video
        ref={videoRef}
        className="riffsync-room-page__participant-tile-video"
        playsInline
        muted
        autoPlay
      />
      <figcaption className="riffsync-room-page__participant-tile-label">{tile.label}</figcaption>
    </figure>
  )
}
