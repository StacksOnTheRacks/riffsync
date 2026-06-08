import type { RoomMode, RoomPatchResult, RoomSnapshot } from '../api/roomsApi'

export function buildRoomModePatch(nextMode: RoomMode): { roomMode: RoomMode } {
  return { roomMode: nextMode }
}

export function buildAvDisabledPatch(next: boolean): { avDisabled: boolean } {
  return { avDisabled: next }
}

export function formatHostRoomPatchError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/409/.test(msg) || /stale version/i.test(msg) || /conflict/i.test(msg)) {
    return 'Room settings changed elsewhere. Refresh and try again.'
  }
  return msg
}

export function mergeRoomPatchResult(snapshot: RoomSnapshot, res: RoomPatchResult): RoomSnapshot {
  return {
    ...snapshot,
    version: res.version,
    catalogEpisodeId: res.catalogEpisodeId,
    youtubeVideoId: res.youtubeVideoId,
    visibility: res.visibility,
    lastActivityAt: res.lastActivityAt,
    roomMode: res.roomMode,
    avDisabled: res.avDisabled,
    broadcastCaptureActive: res.broadcastCaptureActive,
    ...(res.displayTitle !== undefined ? { displayTitle: res.displayTitle } : {}),
  }
}

export function roomModeAnnounceCopy(mode: RoomMode): string {
  return mode === 'videoChat' ? 'Room layout Video Chat' : 'Room layout Theater'
}

export function avDisabledAnnounceCopy(disabled: boolean): string {
  return disabled
    ? 'Room camera and microphone disabled by host'
    : 'Room camera and microphone enabled by host'
}
