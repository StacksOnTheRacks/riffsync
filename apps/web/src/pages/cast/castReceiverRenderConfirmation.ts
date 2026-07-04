import type { CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'

export function canConfirmCastReceiverRender(
  snapshot: CastPresentationSnapshot | null,
  liveStream: MediaStream | null = null,
): boolean {
  if (!snapshot?.stagePrimary || !snapshot.chatOverlay) return false
  if (snapshot.stagePrimary.kind !== 'live_stream') return true
  return Boolean(liveStream?.getTracks().some((track) => track.readyState === 'live'))
}
