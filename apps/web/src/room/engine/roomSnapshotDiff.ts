import type { RoomMode, RoomSnapshot } from '../../api/roomsApi'

export type RoomSnapshotMediaFields = {
  roomMode: RoomMode
  avDisabled: boolean
  youtubeVideoId: string | null | undefined
  broadcastCaptureActive: boolean | undefined
}

export function pickRoomSnapshotMediaFields(
  room: RoomSnapshot | null | undefined,
): RoomSnapshotMediaFields | null {
  if (!room) return null
  return {
    roomMode: room.roomMode,
    avDisabled: room.avDisabled,
    youtubeVideoId: room.youtubeVideoId,
    broadcastCaptureActive: room.broadcastCaptureActive,
  }
}

export function roomSnapshotMediaFieldsEqual(
  a: RoomSnapshotMediaFields | null,
  b: RoomSnapshotMediaFields | null,
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.roomMode === b.roomMode &&
    a.avDisabled === b.avDisabled &&
    a.youtubeVideoId === b.youtubeVideoId &&
    a.broadcastCaptureActive === b.broadcastCaptureActive
  )
}
