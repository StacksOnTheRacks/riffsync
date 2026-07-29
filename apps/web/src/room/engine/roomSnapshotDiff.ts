import type { RoomMode, RoomPlaybackHost, RoomSnapshot } from '../../api/roomsApi'

export type RoomSnapshotMediaFields = {
  roomMode: RoomMode
  avDisabled: boolean
  playbackHost: RoomPlaybackHost
  customPlaybackUrl: string | null
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
    playbackHost: room.playbackHost === 'custom' ? 'custom' : 'youtube',
    customPlaybackUrl: room.customPlaybackUrl,
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
    a.playbackHost === b.playbackHost &&
    a.customPlaybackUrl === b.customPlaybackUrl &&
    a.youtubeVideoId === b.youtubeVideoId &&
    a.broadcastCaptureActive === b.broadcastCaptureActive
  )
}
