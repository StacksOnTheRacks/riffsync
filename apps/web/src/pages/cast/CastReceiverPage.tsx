import { useEffect, useRef, useState } from 'react'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import {
  CastReceiverPresentation,
} from './CastReceiverPresentation'
import { canConfirmCastReceiverRender } from './castReceiverRenderConfirmation'
import {
  getCastReceiverContextForTests,
  sendCastReceiverRenderConfirmed,
  sendCastReceiverRenderFailed,
  startCastReceiverSession,
} from './castReceiverSession'

export function CastReceiverPage() {
  const [snapshot, setSnapshot] = useState<CastPresentationSnapshot | null>(null)
  const [chatMessages, setChatMessages] = useState<CastChatOverlayLine[]>([])
  const renderConfirmedRef = useRef(false)

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

  useEffect(() => {
    if (renderConfirmedRef.current) return
    if (!canConfirmCastReceiverRender(snapshot)) return

    const context = getCastReceiverContextForTests()
    if (!context) return

    renderConfirmedRef.current = true
    sendCastReceiverRenderConfirmed(context)
  }, [snapshot, chatMessages])

  return <CastReceiverPresentation snapshot={snapshot} chatMessages={chatMessages} />
}
