import { describe, expect, it } from 'vitest'
import { CAST_RECEIVER_COPY, resolveCastReceiverStagePlaceholder } from './castReceiverCopy'

describe('castReceiverCopy', () => {
  it('maps waiting sender labels to receiver room-video copy', () => {
    expect(
      resolveCastReceiverStagePlaceholder({
        kind: 'live_video_placeholder',
        label: 'Waiting for party video',
      }),
    ).toBe(CAST_RECEIVER_COPY.waitingForRoomVideo)
  })

  it('preserves playback attention copy from the sender snapshot', () => {
    expect(
      resolveCastReceiverStagePlaceholder({
        kind: 'live_video_placeholder',
        label: CAST_RECEIVER_COPY.playbackNeedsAttention,
      }),
    ).toBe(CAST_RECEIVER_COPY.playbackNeedsAttention)
  })

  it('preserves active live video labels', () => {
    expect(
      resolveCastReceiverStagePlaceholder({
        kind: 'live_video_placeholder',
        label: 'Host shared stream',
      }),
    ).toBe('Host shared stream')
  })
})
