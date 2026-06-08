import { describe, expect, it } from 'vitest'
import {
  buildAvDisabledPatch,
  buildRoomModePatch,
  formatHostRoomPatchError,
  mergeRoomPatchResult,
} from './hostRoomControls'
import type { RoomSnapshot } from '../api/roomsApi'

const baseSnapshot: RoomSnapshot = {
  roomId: 'room-1',
  hostSub: 'host-sub',
  catalogEpisodeId: 'ep-1',
  youtubeVideoId: 'yt-1',
  playbackExpectation: 'free',
  visibility: 'public',
  lastActivityAt: 1,
  version: 2,
  roomMode: 'theater',
  avDisabled: false,
  broadcastCaptureActive: false,
}

describe('hostRoomControls patch helpers', () => {
  it('buildRoomModePatch sends only roomMode', () => {
    expect(buildRoomModePatch('videoChat')).toEqual({ roomMode: 'videoChat' })
  })

  it('buildAvDisabledPatch sends only avDisabled', () => {
    expect(buildAvDisabledPatch(true)).toEqual({ avDisabled: true })
  })

  it('mergeRoomPatchResult bumps version and layout fields', () => {
    const merged = mergeRoomPatchResult(baseSnapshot, {
      ok: true,
      roomId: 'room-1',
      version: 3,
      catalogEpisodeId: 'ep-1',
      youtubeVideoId: 'yt-1',
      visibility: 'public',
      lastActivityAt: 99,
      roomMode: 'videoChat',
      avDisabled: true,
      broadcastCaptureActive: false,
    })
    expect(merged.version).toBe(3)
    expect(merged.roomMode).toBe('videoChat')
    expect(merged.avDisabled).toBe(true)
  })

  it('formatHostRoomPatchError maps stale version to recoverable copy', () => {
    expect(formatHostRoomPatchError(new Error('Update room failed (409): Conflict'))).toContain(
      'Refresh and try again',
    )
  })
})
