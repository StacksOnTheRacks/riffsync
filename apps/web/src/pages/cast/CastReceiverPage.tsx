import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import {
  CastReceiverPresentation,
} from './CastReceiverPresentation'
import { canConfirmCastReceiverRender } from './castReceiverRenderConfirmation'
import {
  castReceiverLiveStreamFailureReasonFromError,
  startCastReceiverLiveStream,
  type CastReceiverLiveStreamFailureReason,
  type CastReceiverLiveStreamSession,
} from './castReceiverLiveStream'
import {
  getActiveCastReceiverContext,
  sendCastReceiverRenderFailed,
  sendCastReceiverRendered,
  startCastReceiverSession,
} from './castReceiverSession'

type LiveStreamState = {
  snapshotId: string
  stream: MediaStream | null
}

export function CastReceiverPage() {
  const [snapshot, setSnapshot] = useState<CastPresentationSnapshot | null>(null)
  const [chatMessages, setChatMessages] = useState<CastChatOverlayLine[]>([])
  const [liveStreamState, setLiveStreamState] = useState<LiveStreamState | null>(null)
  const confirmedSnapshotIdRef = useRef<string | null>(null)
  const liveStream =
    snapshot?.stagePrimary.kind === 'live_stream' && liveStreamState?.snapshotId === snapshot.snapshotId
      ? liveStreamState.stream
      : null

  useEffect(() => {
    let cancelled = false

    void startCastReceiverSession({
      onPresentationSnapshot: (nextSnapshot) => {
        if (cancelled) return
        setSnapshot(nextSnapshot)
        setChatMessages(nextSnapshot.chatOverlay.messages)
      },
      onChatOverlayUpdate: (messages) => {
        if (cancelled) return
        setChatMessages(messages)
      },
    }).catch(() => {
      const context = getActiveCastReceiverContext()
      if (context) sendCastReceiverRenderFailed(context, 'receiver_bootstrap_failed')
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (snapshot?.stagePrimary.kind !== 'live_stream' || !snapshot.stagePrimary.livePlayback) {
      return
    }

    let cancelled = false
    let liveSession: CastReceiverLiveStreamSession | null = null
    let failureSent = false
    const snapshotId = snapshot.snapshotId
    const sendLiveStreamFailure = (reason: CastReceiverLiveStreamFailureReason) => {
      if (cancelled || failureSent) return
      failureSent = true
      const context = getActiveCastReceiverContext()
      if (context) sendCastReceiverRenderFailed(context, reason)
    }

    void startCastReceiverLiveStream({
      livePlayback: snapshot.stagePrimary.livePlayback,
      onRemoteStream: (stream) => {
        if (!cancelled) setLiveStreamState({ snapshotId, stream })
      },
      onPlaybackUnavailable: sendLiveStreamFailure,
    })
      .then((session) => {
        if (cancelled) {
          session.close()
          return
        }
        liveSession = session
      })
      .catch((error) => {
        sendLiveStreamFailure(castReceiverLiveStreamFailureReasonFromError(error))
      })

    return () => {
      cancelled = true
      liveSession?.close()
    }
  }, [snapshot])

  useLayoutEffect(() => {
    if (!snapshot || !canConfirmCastReceiverRender(snapshot, liveStream)) return
    if (confirmedSnapshotIdRef.current === snapshot.snapshotId) return

    const stagePrimary = document.querySelector('[data-testid="cast-receiver-stage-primary"]')
    const chatOverlay = document.querySelector('[data-testid="cast-receiver-chat-overlay"]')
    if (!stagePrimary || !chatOverlay) return

    const context = getActiveCastReceiverContext()
    if (!context) return

    confirmedSnapshotIdRef.current = snapshot.snapshotId
    sendCastReceiverRendered(context, snapshot.snapshotId)
  }, [snapshot, chatMessages, liveStream])

  return <CastReceiverPresentation snapshot={snapshot} chatMessages={chatMessages} liveStream={liveStream} />
}
