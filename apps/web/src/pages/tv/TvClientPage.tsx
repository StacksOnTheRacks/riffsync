import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createTvPairing, pollTvPairing } from '../../api/tvPairingApi'
import type { CastChatOverlayLine, CastPresentationSnapshot } from '../../room/cast/castChannelProtocol'
import {
  castReceiverLiveStreamFailureReasonFromError,
  startCastReceiverLiveStream,
  type CastReceiverLiveStreamSession,
} from '../cast/castReceiverLiveStream'
import { TvClientShell } from '../../tv/TvClientShell'
import { emitTvDebugEvent } from '../../tv/tvDebugEvents'

const POLL_MS = 2000

export function TvClientPage() {
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [linked, setLinked] = useState(false)
  const [snapshot, setSnapshot] = useState<CastPresentationSnapshot | null>(null)
  const [chatMessages, setChatMessages] = useState<CastChatOverlayLine[]>([])
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
  const tvClientSessionIdRef = useRef<string | null>(null)
  const liveSessionRef = useRef<CastReceiverLiveStreamSession | null>(null)
  const firstFrameLoggedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let pairingId = ''
    let pollToken = ''

    emitTvDebugEvent('tv_boot', {})

    void createTvPairing()
      .then((created) => {
        if (cancelled) return
        pairingId = created.pairingId
        pollToken = created.pollToken
        setPairingCode(created.code)
        emitTvDebugEvent('tv_pairing_created', {})
        emitTvDebugEvent('tv_pairing_waiting', {})

        pollTimer = setInterval(() => {
          void pollTvPairing(pairingId, pollToken)
            .then((poll) => {
              if (cancelled) return
              if (poll.status === 'expired') {
                setPairingError('Code expired. Refresh this page for a new code.')
                return
              }
              if (poll.status !== 'linked') return

              setLinked(true)
              tvClientSessionIdRef.current = poll.tvClientSessionId ?? null
              emitTvDebugEvent('tv_pairing_linked', {
                tvClientSessionId: poll.tvClientSessionId,
              })

              if (poll.snapshot) {
                setSnapshot(poll.snapshot)
                setChatMessages(poll.chatOverlay?.messages ?? poll.snapshot.chatOverlay.messages)
                emitTvDebugEvent('tv_link_snapshot', {
                  tvClientSessionId: poll.tvClientSessionId,
                  snapshotId: poll.snapshot.snapshotId,
                  playbackPath: poll.snapshot.playbackPath,
                })
              } else if (poll.chatOverlay) {
                setChatMessages(poll.chatOverlay.messages)
              }

              if (
                poll.livePlayback &&
                poll.snapshot?.stagePrimary.kind === 'live_stream' &&
                !liveSessionRef.current
              ) {
                emitTvDebugEvent('tv_sfu_token', { tvClientSessionId: poll.tvClientSessionId })
                void startCastReceiverLiveStream({
                  livePlayback: poll.livePlayback,
                  onRemoteStream: (stream) => {
                    setLiveStream(stream)
                    if (stream && !firstFrameLoggedRef.current) {
                      firstFrameLoggedRef.current = true
                      emitTvDebugEvent('tv_first_frame', {
                        tvClientSessionId: tvClientSessionIdRef.current ?? undefined,
                      })
                      emitTvDebugEvent('tv_sfu_connected', {
                        tvClientSessionId: tvClientSessionIdRef.current ?? undefined,
                      })
                    }
                  },
                  onPlaybackUnavailable: (reason) => {
                    emitTvDebugEvent('tv_playback_blocked', {
                      tvClientSessionId: tvClientSessionIdRef.current ?? undefined,
                      reason,
                      failureClass: 'network',
                    })
                  },
                })
                  .then((session) => {
                    if (cancelled) {
                      session.close()
                      return
                    }
                    liveSessionRef.current = session
                  })
                  .catch((error) => {
                    emitTvDebugEvent('tv_playback_blocked', {
                      tvClientSessionId: tvClientSessionIdRef.current ?? undefined,
                      reason: castReceiverLiveStreamFailureReasonFromError(error),
                      failureClass: 'network',
                    })
                  })
              }
            })
            .catch(() => {
              /* transient poll errors; keep waiting */
            })
        }, POLL_MS)
      })
      .catch(() => {
        if (!cancelled) setPairingError('Could not create a TV code. Refresh and try again.')
      })

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
      liveSessionRef.current?.close()
      liveSessionRef.current = null
      emitTvDebugEvent('tv_teardown', {
        tvClientSessionId: tvClientSessionIdRef.current ?? undefined,
      })
    }
  }, [])

  useLayoutEffect(() => {
    if (!linked || !snapshot) return
    emitTvDebugEvent('tv_overlay_ready', {
      tvClientSessionId: snapshot.tvClientSessionId ?? tvClientSessionIdRef.current ?? undefined,
      snapshotId: snapshot.snapshotId,
    })
  }, [linked, snapshot])

  return (
    <TvClientShell
      mode={linked ? 'linked' : 'waiting'}
      pairingCode={pairingCode}
      pairingError={pairingError}
      snapshot={snapshot}
      chatMessages={chatMessages}
      liveStream={liveStream}
    />
  )
}
