import { describe, expect, it } from 'vitest'
import { buildCastPresentationSnapshot } from './buildCastPresentationSnapshot'
import { resetCastSnapshotIdCounterForTests } from './castChannelProtocol'

describe('buildCastPresentationSnapshot', () => {
  it('assigns a snapshotId to each presentation snapshot', () => {
    resetCastSnapshotIdCounterForTests()
    const snapshot = buildCastPresentationSnapshot({
      roomMode: 'theater',
      youtubeVideoId: 'abc123',
      isPublisher: false,
      hasHostCaptureStream: false,
      hasGuestRelayStream: false,
      chat: [],
      chatMemberLabels: new Map(),
    })

    expect(snapshot.snapshotId).toBe('cast-snapshot-1')
  })

  it('uses youtube embed metadata for theater guests without relay video', () => {
    const snapshot = buildCastPresentationSnapshot({
      roomMode: 'theater',
      youtubeVideoId: 'abc123',
      isPublisher: false,
      hasHostCaptureStream: false,
      hasGuestRelayStream: false,
      chat: [{ kind: 'text', messageId: 'm1', sessionId: 's1', displayName: 'Fan', text: 'hello', ts: 1 }],
      chatMemberLabels: new Map([['s1', 'Fan']]),
    })

    expect(snapshot.stagePrimary).toEqual({
      kind: 'youtube_embed',
      youtubeVideoId: 'abc123',
      label: 'Party video',
    })
    expect(snapshot.chatOverlay.messages[0]?.text).toBe('Fan: hello')
  })

  it('uses live video placeholder when host capture is active', () => {
    const snapshot = buildCastPresentationSnapshot({
      roomMode: 'theater',
      youtubeVideoId: 'abc123',
      isPublisher: true,
      hasHostCaptureStream: true,
      hasGuestRelayStream: false,
      chat: [],
      chatMemberLabels: new Map(),
    })

    expect(snapshot.stagePrimary.kind).toBe('live_video_placeholder')
  })

  it('uses live stream metadata when cast playback can consume the host screen', () => {
    const snapshot = buildCastPresentationSnapshot({
      roomMode: 'theater',
      youtubeVideoId: 'abc123',
      isPublisher: false,
      hasHostCaptureStream: false,
      hasGuestRelayStream: true,
      livePlayback: {
        roomId: 'room-1',
        sessionId: 'session-1',
        apiBaseUrl: 'https://api.test.example',
      },
      chat: [],
      chatMemberLabels: new Map(),
    })

    expect(snapshot.stagePrimary).toEqual({
      kind: 'live_stream',
      label: 'Party video',
      livePlayback: {
        roomId: 'room-1',
        sessionId: 'session-1',
        apiBaseUrl: 'https://api.test.example',
      },
    })
  })
})
