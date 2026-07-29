import { describe, expect, it } from 'vitest'
import type { RoomSnapshot } from '../../api/roomsApi'
import {
  pickRoomSnapshotMediaFields,
  roomSnapshotMediaFieldsEqual,
} from './roomSnapshotDiff'

function baseRoom(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomId: 'room-1',
    hostSub: 'host-sub',
    catalogEpisodeId: 'ep-1',
    playbackHost: 'youtube',
    customPlaybackUrl: null,
    youtubeVideoId: 'dQw4w9WgXcQ',
    playbackExpectation: 'free',
    visibility: 'public',
    lastActivityAt: 1,
    version: 1,
    roomMode: 'theater',
    avDisabled: false,
    broadcastCaptureActive: false,
    ...overrides,
  }
}

describe('pickRoomSnapshotMediaFields', () => {
  it('includes playbackHost and customPlaybackUrl', () => {
    const room = baseRoom({
      playbackHost: 'custom',
      customPlaybackUrl: 'https://example.com/watch/123',
      youtubeVideoId: undefined,
    })

    expect(pickRoomSnapshotMediaFields(room)).toEqual({
      roomMode: 'theater',
      avDisabled: false,
      playbackHost: 'custom',
      customPlaybackUrl: 'https://example.com/watch/123',
      youtubeVideoId: undefined,
      broadcastCaptureActive: false,
    })
  })

  it('defaults unknown playbackHost values to youtube', () => {
    const room = baseRoom({ playbackHost: 'other' as 'youtube' })

    expect(pickRoomSnapshotMediaFields(room)?.playbackHost).toBe('youtube')
  })
})

describe('roomSnapshotMediaFieldsEqual', () => {
  it('detects playbackHost and customPlaybackUrl changes for episode retarget', () => {
    const before = pickRoomSnapshotMediaFields(
      baseRoom({
        playbackHost: 'youtube',
        customPlaybackUrl: null,
        youtubeVideoId: 'abc123',
      }),
    )
    const after = pickRoomSnapshotMediaFields(
      baseRoom({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.com/watch/456',
        youtubeVideoId: undefined,
      }),
    )

    expect(roomSnapshotMediaFieldsEqual(before, after)).toBe(false)
  })

  it('treats identical playback mirrors as equal', () => {
    const a = pickRoomSnapshotMediaFields(
      baseRoom({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.com/watch/456',
      }),
    )
    const b = pickRoomSnapshotMediaFields(
      baseRoom({
        playbackHost: 'custom',
        customPlaybackUrl: 'https://example.com/watch/456',
      }),
    )

    expect(roomSnapshotMediaFieldsEqual(a, b)).toBe(true)
  })
})
