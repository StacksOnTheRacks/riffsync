import type { RoomMode } from '../api/roomsApi'

export function parseInboundRoomMode(raw: unknown): RoomMode | null {
  if (raw === 'theater' || raw === 'videoChat') return raw
  return null
}

/** True when authoritative room mode transitions into Video Chat. */
export function enteredVideoChatMode(previous: RoomMode, next: RoomMode): boolean {
  return previous !== 'videoChat' && next === 'videoChat'
}

export function stopMediaStreamTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* ignore */
    }
  }
}
