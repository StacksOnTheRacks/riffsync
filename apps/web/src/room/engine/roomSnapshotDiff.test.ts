import { describe, expect, it } from 'vitest'
import {
  pickRoomSnapshotMediaFields,
  roomSnapshotMediaFieldsEqual,
} from './roomSnapshotDiff'

describe('roomSnapshotDiff', () => {
  const base: import('../../api/roomsApi').RoomSnapshot = {
    roomId: 'room-1',
    hostSub: 'host',
    roomMode: 'theater',
    avDisabled: false,
    youtubeVideoId: 'vid-1',
    broadcastCaptureActive: false,
    catalogEpisodeId: 'ep-1',
    playbackExpectation: 'free',
    visibility: 'public',
    lastActivityAt: 1000,
    version: 1,
  }

  it('ignores lastActivityAt-only snapshot churn', () => {
    const a = pickRoomSnapshotMediaFields({ ...base, lastActivityAt: 1000 })
    const b = pickRoomSnapshotMediaFields({ ...base, lastActivityAt: 5000 })
    expect(roomSnapshotMediaFieldsEqual(a, b)).toBe(true)
  })

  it('detects roomMode changes', () => {
    const a = pickRoomSnapshotMediaFields(base)
    const b = pickRoomSnapshotMediaFields({ ...base, roomMode: 'videoChat' })
    expect(roomSnapshotMediaFieldsEqual(a, b)).toBe(false)
  })
})
