import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import {
  CastReceiverPresentation,
} from './CastReceiverPresentation'
import { canConfirmCastReceiverRender } from './castReceiverRenderConfirmation'
import { startCastReceiverLiveStream, type CastReceiverLiveStreamSession } from './castReceiverLiveStream'
import {
  getActiveCastReceiverContext,
  sendCastReceiverRenderFailed,
  sendCastReceiverRendered,
  startCastReceiverSession,
} from './castReceiverSession'

export function CastReceiverPage() {
  const [snapshot, setSnapshot] = useState<CastPresentationSnapshot | null>(null)
  const [chatMessages, setChatMessages] = useState<CastChatOverlayLine[]>([])
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
  const confirmedSnapshotIdRef = useRef<string | null>(null)

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
      setLiveStream(null)
      return
    }

    let cancelled = false
    let liveSession: CastReceiverLiveStreamSession | null = null
    setLiveStream(null)

    void startCastReceiverLiveStream({
      livePlayback: snapshot.stagePrimary.livePlayback,
      onRemoteStream: (stream) => {
        if (!cancelled) setLiveStream(stream)
      },
      onPlaybackUnavailable: () => {
        const context = getActiveCastReceiverContext()
        if (context) sendCastReceiverRenderFailed(context, 'receiver_live_stream_unavailable')
      },
    })
      .then((session) => {
        if (cancelled) {
          session.close()
          return
        }
        liveSession = session
      })
      .catch(() => {
        const context = getActiveCastReceiverContext()
        if (context) sendCastReceiverRenderFailed(context, 'receiver_live_stream_failed')
      })

    return () => {
      cancelled = true
      liveSession?.close()
      setLiveStream(null)
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
