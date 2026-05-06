import { HOST_ICERESTART_DEBOUNCE_MS } from './constants'
import { SHARE_SIGNAL_PROTOCOL_VERSION } from './types'

/** After sustained `disconnected`, host sends a new offer with ICE restart (`iceRestart` offer option). */

type RecoveryCtx = {
  sendJson: (payload: Record<string, unknown>) => void
  getShareGeneration: () => number
}

const restartTimersByGuest = new Map<string, ReturnType<typeof globalThis.setTimeout>>()

function clearRestartTimer(guestSessionId: string): void {
  const t = restartTimersByGuest.get(guestSessionId)
  if (t !== undefined) {
    globalThis.clearTimeout(t)
    restartTimersByGuest.delete(guestSessionId)
  }
}

export function attachHostPcIceRecovery(
  pc: RTCPeerConnection,
  guestSessionId: string,
  getPeerStillCurrent: () => boolean,
  ctx: RecoveryCtx,
): void {
  const flagRef = { pending: false }
  pc.addEventListener('connectionstatechange', () => {
    if (!getPeerStillCurrent()) {
      clearRestartTimer(guestSessionId)
      return
    }

    const st = pc.connectionState
    if (st !== 'disconnected') {
      clearRestartTimer(guestSessionId)
      flagRef.pending = false
      return
    }

    if (flagRef.pending) return
    flagRef.pending = true

    clearRestartTimer(guestSessionId)
    restartTimersByGuest.set(
      guestSessionId,
      globalThis.setTimeout(() => {
        restartTimersByGuest.delete(guestSessionId)
        if (!getPeerStillCurrent() || pc.connectionState !== 'disconnected') {
          flagRef.pending = false
          return
        }
        flagRef.pending = false
        void offerIceRestartOnHostPc(pc, guestSessionId, getPeerStillCurrent, ctx).catch(() => undefined)
      }, HOST_ICERESTART_DEBOUNCE_MS),
    )
  })

  pc.addEventListener(
    'close',
    () => {
      clearRestartTimer(guestSessionId)
    },
    { once: true },
  )
}

async function offerIceRestartOnHostPc(
  pc: RTCPeerConnection,
  guestSessionId: string,
  getPeerStillCurrent: () => boolean,
  ctx: RecoveryCtx,
): Promise<void> {
  if (!getPeerStillCurrent() || pc.signalingState !== 'stable') return
  try {
    if (typeof pc.restartIce === 'function') {
      pc.restartIce()
    }
    const offer = await pc.createOffer({ iceRestart: true })
    await pc.setLocalDescription(offer)
    const gen = ctx.getShareGeneration()
    ctx.sendJson({
      action: 'signaling',
      envelope: {
        protocolVersion: SHARE_SIGNAL_PROTOCOL_VERSION,
        ...(gen > 0 ? { shareGeneration: gen } : {}),
        kind: 'offer',
        sdp: { type: offer.type, sdp: offer.sdp ?? '' },
        targetSessionId: guestSessionId,
      },
    })
  } catch {
    /* non-fatal; guest may reconnect via ready pings */
  }
}
