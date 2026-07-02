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
})
