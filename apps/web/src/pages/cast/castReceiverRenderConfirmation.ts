import type { CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'

export function canConfirmCastReceiverRender(snapshot: CastPresentationSnapshot | null): boolean {
  return Boolean(snapshot?.stagePrimary)
}
