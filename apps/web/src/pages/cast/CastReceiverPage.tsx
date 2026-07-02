import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import {
  CastReceiverPresentation,
} from './CastReceiverPresentation'
import { canConfirmCastReceiverRender } from './castReceiverRenderConfirmation'
import {
  getCastReceiverContextForTests,
  sendCastReceiverRenderFailed,
  sendCastReceiverRendered,
  startCastReceiverSession,
} from './castReceiverSession'

export function CastReceiverPage() {
  const [snapshot, setSnapshot] = useState<CastPresentationSnapshot | null>(null)
  const [chatMessages, setChatMessages] = useState<CastChatOverlayLine[]>([])
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
      const context = getCastReceiverContextForTests()
      if (context) sendCastReceiverRenderFailed(context, 'receiver_bootstrap_failed')
    })

    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    if (!snapshot || !canConfirmCastReceiverRender(snapshot)) return
    if (confirmedSnapshotIdRef.current === snapshot.snapshotId) return

    const stagePrimary = document.querySelector('[data-testid="cast-receiver-stage-primary"]')
    const chatOverlay = document.querySelector('[data-testid="cast-receiver-chat-overlay"]')
    if (!stagePrimary || !chatOverlay) return

    const context = getCastReceiverContextForTests()
    if (!context) return

    confirmedSnapshotIdRef.current = snapshot.snapshotId
    sendCastReceiverRendered(context, snapshot.snapshotId)
  }, [snapshot, chatMessages])

  return <CastReceiverPresentation snapshot={snapshot} chatMessages={chatMessages} />
}
