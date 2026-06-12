import type { ReactNode } from 'react'
import type { RoomMode } from '../../api/roomsApi'
import { ParticipantVideoTile } from './ParticipantVideoTile'
import {
  LAYOUT_UPDATING_COPY,
  VIDEO_CHAT_EMPTY_COPY,
  type StageParticipantTile,
  stageLayoutSurfaceClass,
} from './stageParticipantTiles'

type StageParticipantLayoutProps = {
  roomMode: RoomMode
  tiles: StageParticipantTile[]
  layoutUpdating: boolean
  viewportWide: boolean
  avSurfacesEnabled: boolean
  playback: ReactNode
}

export function StageParticipantLayout({
  roomMode,
  tiles,
  layoutUpdating,
  viewportWide,
  avSurfacesEnabled,
  playback,
}: StageParticipantLayoutProps) {
  const showDesktopStrip = avSurfacesEnabled && viewportWide && roomMode === 'theater' && tiles.length > 0
  const showNarrowRow =
    avSurfacesEnabled && !viewportWide && roomMode === 'theater' && tiles.length > 0
  const showVideoChatEmpty =
    roomMode === 'videoChat' && viewportWide && tiles.length === 0 && !layoutUpdating

  const tileList = (
    <>
      {tiles.map((tile) => (
        <ParticipantVideoTile key={tile.key} tile={tile} />
      ))}
    </>
  )

  return (
    <div
      className={`riffsync-room-page__stage-media ${stageLayoutSurfaceClass(roomMode)}${layoutUpdating ? ' riffsync-room-page__stage-media--updating' : ''}`}
      data-room-mode={roomMode}
    >
      {layoutUpdating ? (
        <p className="riffsync-room-page__stage-layout-status" role="status">
          {LAYOUT_UPDATING_COPY}
        </p>
      ) : null}
      <div className="riffsync-room-page__stage-primary-wrap">
        {roomMode === 'theater' ? (
          <div className="riffsync-room-page__theater-row">
            <div className="riffsync-room-page__theater-playback">{playback}</div>
            {showDesktopStrip ? (
              <div
                className="riffsync-room-page__participant-strip riffsync-room-page__participant-strip--desktop"
                aria-label="Participant cameras"
              >
                {tileList}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="riffsync-room-page__participant-grid"
            aria-label="Participant cameras"
          >
            {showVideoChatEmpty ? (
              <p className="riffsync-room-page__participant-grid-empty" role="status">
                {VIDEO_CHAT_EMPTY_COPY}
              </p>
            ) : (
              tileList
            )}
          </div>
        )}
      </div>
      {showNarrowRow ? (
        <div
          className="riffsync-room-page__participant-row riffsync-room-page__participant-row--narrow"
          aria-label="Participant cameras"
        >
          {tileList}
        </div>
      ) : null}
    </div>
  )
}
