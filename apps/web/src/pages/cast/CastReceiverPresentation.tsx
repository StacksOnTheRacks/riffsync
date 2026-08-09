import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import { TvClientShell } from '../../tv/TvClientShell'

type CastReceiverPresentationProps = {
  snapshot: CastPresentationSnapshot | null
  chatMessages: CastChatOverlayLine[]
  liveStream?: MediaStream | null
}

/** Cast/TV linked presentation shell (shared with `/tv` via TvClientShell). */
export function CastReceiverPresentation({
  snapshot,
  chatMessages,
  liveStream = null,
}: CastReceiverPresentationProps) {
  return (
    <TvClientShell
      mode="linked"
      snapshot={snapshot}
      chatMessages={chatMessages}
      liveStream={liveStream}
    />
  )
}
