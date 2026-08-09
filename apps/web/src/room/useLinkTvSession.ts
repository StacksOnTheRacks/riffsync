import { useCallback, useEffect, useState } from 'react'
import {
  claimTvPairing,
  pushTvPairingPresentation,
  releaseTvPairing,
} from '../api/tvPairingApi'
import { createTvClientSessionId } from '../tv/tvClientIds'
import { emitTvDebugEvent } from '../tv/tvDebugEvents'
import {
  buildCastPresentationSnapshot,
  type BuildCastPresentationSnapshotInput,
} from './cast/buildCastPresentationSnapshot'

export type UseLinkTvSessionInput = {
  enabled: boolean
  roomId: string
  sessionId: string
  apiBaseUrl?: string
  snapshotInput: BuildCastPresentationSnapshotInput
}

export type UseLinkTvSessionResult = {
  linkPanelOpen: boolean
  openLinkPanel: () => void
  closeLinkPanel: () => void
  linkActive: boolean
  claimCode: (code: string) => Promise<void>
  stopLink: () => void
  tvClientSessionId: string | null
}

type LinkPairing = {
  pairingId: string
  claimToken: string
  tvClientSessionId: string
}

async function releasePairingBestEffort(pairing: LinkPairing | null): Promise<void> {
  if (!pairing) return
  try {
    await releaseTvPairing({
      pairingId: pairing.pairingId,
      claimToken: pairing.claimToken,
    })
  } catch {
    /* Best-effort; TV TTL / next poll still ends the session. */
  }
}

export function useLinkTvSession({
  enabled,
  roomId,
  sessionId,
  apiBaseUrl,
  snapshotInput,
}: UseLinkTvSessionInput): UseLinkTvSessionResult {
  const [linkPanelOpen, setLinkPanelOpen] = useState(false)
  const [linkActive, setLinkActive] = useState(false)
  const [tvClientSessionId, setTvClientSessionId] = useState<string | null>(null)
  const [pairing, setPairing] = useState<LinkPairing | null>(null)
  const [prevEnabled, setPrevEnabled] = useState(enabled)

  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled)
    if (!enabled && (linkActive || pairing || tvClientSessionId)) {
      const id = pairing?.tvClientSessionId ?? tvClientSessionId
      const current = pairing
      setPairing(null)
      setLinkActive(false)
      setTvClientSessionId(null)
      void releasePairingBestEffort(current)
      if (id) emitTvDebugEvent('tv_teardown', { tvClientSessionId: id, failureClass: undefined })
    }
  }

  const stopLink = useCallback(() => {
    const id = pairing?.tvClientSessionId ?? tvClientSessionId
    const current = pairing
    setPairing(null)
    setLinkActive(false)
    setTvClientSessionId(null)
    void releasePairingBestEffort(current).finally(() => {
      if (id) emitTvDebugEvent('tv_teardown', { tvClientSessionId: id, failureClass: undefined })
    })
  }, [pairing, tvClientSessionId])

  useEffect(() => {
    if (!linkActive || !pairing) return
    const { pairingId, claimToken, tvClientSessionId: session } = pairing
    const snapshot = buildCastPresentationSnapshot({
      ...snapshotInput,
      tvClientSessionId: session,
    })
    void pushTvPairingPresentation({
      pairingId,
      claimToken,
      snapshot,
      chatMessages: snapshot.chatOverlay.messages,
    })
      .then(() => {
        emitTvDebugEvent('tv_snapshot_sent', {
          tvClientSessionId: session,
          snapshotId: snapshot.snapshotId,
          playbackPath: snapshot.playbackPath,
        })
      })
      .catch(() => {
        /* Best-effort presentation push; next chat/state change retries. */
      })
  }, [linkActive, pairing, snapshotInput])

  const claimCode = useCallback(
    async (code: string) => {
      const nextTvClientSessionId = createTvClientSessionId()
      emitTvDebugEvent('tv_pairing_claim', { tvClientSessionId: nextTvClientSessionId })
      const claimed = await claimTvPairing({
        code,
        roomId,
        sessionId,
        apiBaseUrl,
        tvClientSessionId: nextTvClientSessionId,
      })
      setPairing({
        pairingId: claimed.pairingId,
        claimToken: claimed.claimToken,
        tvClientSessionId: claimed.tvClientSessionId,
      })
      setTvClientSessionId(claimed.tvClientSessionId)
      setLinkActive(true)
      emitTvDebugEvent('tv_pairing_linked', { tvClientSessionId: claimed.tvClientSessionId })

      const snapshot = buildCastPresentationSnapshot({
        ...snapshotInput,
        tvClientSessionId: claimed.tvClientSessionId,
      })
      await pushTvPairingPresentation({
        pairingId: claimed.pairingId,
        claimToken: claimed.claimToken,
        snapshot,
        chatMessages: snapshot.chatOverlay.messages,
      })
    },
    [apiBaseUrl, roomId, sessionId, snapshotInput],
  )

  return {
    linkPanelOpen,
    openLinkPanel: () => setLinkPanelOpen(true),
    closeLinkPanel: () => setLinkPanelOpen(false),
    linkActive,
    claimCode,
    stopLink,
    tvClientSessionId,
  }
}
