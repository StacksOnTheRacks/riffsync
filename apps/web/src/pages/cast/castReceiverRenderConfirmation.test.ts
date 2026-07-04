import { describe, expect, it } from 'vitest'
import { canConfirmCastReceiverRender } from './castReceiverRenderConfirmation'

describe('canConfirmCastReceiverRender', () => {
  it('requires both stage primary and chat overlay in the snapshot', () => {
    expect(canConfirmCastReceiverRender(null)).toBe(false)
    expect(
      canConfirmCastReceiverRender({
        snapshotId: 'snap-1',
        roomMode: 'theater',
        stagePrimary: { kind: 'youtube_embed', youtubeVideoId: 'abc123' },
        chatOverlay: { messages: [] },
      }),
    ).toBe(true)
  })

  it('requires a live track before confirming live-stream receiver playback', () => {
    const snapshot = {
      snapshotId: 'snap-live-1',
      roomMode: 'theater' as const,
      stagePrimary: {
        kind: 'live_stream' as const,
        livePlayback: { roomId: 'room-1', sessionId: 'session-1' },
      },
      chatOverlay: { messages: [] },
    }
    const stream = {
      getTracks: () => [{ readyState: 'live' }],
    } as unknown as MediaStream

    expect(canConfirmCastReceiverRender(snapshot)).toBe(false)
    expect(canConfirmCastReceiverRender(snapshot, stream)).toBe(true)
  })
})
