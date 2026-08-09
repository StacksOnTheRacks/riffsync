import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import { TvClientShell } from '../../tv/TvClientShell'
import { emitTvDebugEvent } from '../../tv/tvDebugEvents'
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
  const firstFrameLoggedRef = useRef(false)
  const liveStream =
    snapshot?.stagePrimary.kind === 'live_stream' && liveStreamState?.snapshotId === snapshot.snapshotId
      ? liveStreamState.stream
      : null

  useEffect(() => {
    let cancelled = false
    emitTvDebugEvent('tv_boot', {})

    void startCastReceiverSession({
      onPresentationSnapshot: (nextSnapshot) => {
        if (cancelled) return
        setSnapshot(nextSnapshot)
        setChatMessages(nextSnapshot.chatOverlay.messages)
        emitTvDebugEvent('tv_link_snapshot', {
          tvClientSessionId: nextSnapshot.tvClientSessionId,
          snapshotId: nextSnapshot.snapshotId,
          playbackPath: nextSnapshot.playbackPath,
        })
      },
      onChatOverlayUpdate: (messages) => {
        if (cancelled) return
        setChatMessages(messages)
      },
    }).catch(() => {
      const context = getActiveCastReceiverContext()
      if (context) sendCastReceiverRenderFailed(context, 'receiver_bootstrap_failed')
      emitTvDebugEvent('tv_render_failed', {
        reason: 'receiver_bootstrap_failed',
        failureClass: 'link_failed',
      })
    })

    return () => {
      cancelled = true
      emitTvDebugEvent('tv_teardown', {
        tvClientSessionId: snapshot?.tvClientSessionId,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- teardown id is best-effort
  }, [])

  useEffect(() => {
    if (snapshot?.stagePrimary.kind !== 'live_stream' || !snapshot.stagePrimary.livePlayback) {
      return
    }

    let cancelled = false
    let liveSession: CastReceiverLiveStreamSession | null = null
    let failureSent = false
    const snapshotId = snapshot.snapshotId
    const tvClientSessionId = snapshot.tvClientSessionId
    const sendLiveStreamFailure = (reason: CastReceiverLiveStreamFailureReason) => {
      if (cancelled || failureSent) return
      failureSent = true
      const context = getActiveCastReceiverContext()
      if (context) sendCastReceiverRenderFailed(context, reason, tvClientSessionId)
      emitTvDebugEvent('tv_playback_blocked', {
        tvClientSessionId,
        snapshotId,
        reason,
        failureClass: 'network',
      })
    }

    emitTvDebugEvent('tv_sfu_token', { tvClientSessionId, snapshotId })
    void startCastReceiverLiveStream({
      livePlayback: snapshot.stagePrimary.livePlayback,
      onRemoteStream: (stream) => {
        if (!cancelled) setLiveStreamState({ snapshotId, stream })
        if (stream && !firstFrameLoggedRef.current) {
          firstFrameLoggedRef.current = true
          emitTvDebugEvent('tv_first_frame', { tvClientSessionId, snapshotId })
          emitTvDebugEvent('tv_sfu_connected', { tvClientSessionId, snapshotId })
        }
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
    sendCastReceiverRendered(context, snapshot.snapshotId, snapshot.tvClientSessionId)
    emitTvDebugEvent('tv_render_ack', {
      tvClientSessionId: snapshot.tvClientSessionId,
      snapshotId: snapshot.snapshotId,
      playbackPath: snapshot.playbackPath,
    })
    emitTvDebugEvent('tv_overlay_ready', {
      tvClientSessionId: snapshot.tvClientSessionId,
      snapshotId: snapshot.snapshotId,
    })
  }, [snapshot, chatMessages, liveStream])

  return (
    <TvClientShell
      mode="linked"
      snapshot={snapshot}
      chatMessages={chatMessages}
      liveStream={liveStream}
    />
  )
}
