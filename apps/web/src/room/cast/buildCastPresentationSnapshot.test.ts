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
    expect(snapshot.playbackPath).toBe('tv_client_idle_youtube_embed')
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
    expect(snapshot.playbackPath).toBe('tv_client_placeholder')
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
      tvClientSessionId: 'tv-client-1',
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
    expect(snapshot.playbackPath).toBe('tv_client_stream')
    expect(snapshot.tvClientSessionId).toBe('tv-client-1')
  })

  it('marks active Theater share as tv_client_stream even when youtubeVideoId exists', () => {
    const snapshot = buildCastPresentationSnapshot({
      roomMode: 'theater',
      youtubeVideoId: 'yt123456789',
      isPublisher: true,
      hasHostCaptureStream: true,
      hasGuestRelayStream: false,
      livePlayback: { roomId: 'room-1', sessionId: 'sess-1' },
      chat: [],
      chatMemberLabels: new Map(),
      tvClientSessionId: 'tv-client-1',
    })

    expect(snapshot.stagePrimary.kind).toBe('live_stream')
    expect(snapshot.playbackPath).toBe('tv_client_stream')
  })
})
