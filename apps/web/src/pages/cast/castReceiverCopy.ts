import type { CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'

export const CAST_RECEIVER_COPY = {
  waitingForPresentation: 'Waiting for party presentation...',
  waitingForRoomVideo: 'Waiting for room video...',
  playbackNeedsAttention: 'Playback needs attention on the sender.',
} as const

export function resolveCastReceiverStagePlaceholder(
  stagePrimary: CastPresentationSnapshot['stagePrimary'],
): string {
  if (stagePrimary.label === CAST_RECEIVER_COPY.playbackNeedsAttention) {
    return CAST_RECEIVER_COPY.playbackNeedsAttention
  }

  if (
    stagePrimary.kind === 'live_video_placeholder' &&
    stagePrimary.label === 'Waiting for party video'
  ) {
    return CAST_RECEIVER_COPY.waitingForRoomVideo
  }

  if (stagePrimary.kind === 'live_video_placeholder' && !stagePrimary.label?.trim()) {
    return CAST_RECEIVER_COPY.waitingForRoomVideo
  }

  return stagePrimary.label ?? CAST_RECEIVER_COPY.waitingForRoomVideo
}
