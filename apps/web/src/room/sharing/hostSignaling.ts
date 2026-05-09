import type { MutableRefObject } from 'react'
import { hostShouldSkipRenegotiation } from '../hostRenegotiationPolicy'
import { attachPcStateLogging } from '../webrtcDebug'
import {
  HOST_STALE_CONNECTING_AFTER_ANSWER_MS,
  HOST_STALE_HAVE_LOCAL_OFFER_MS,
} from './constants'
import { attachHostPcIceRecovery } from './shareSessionRecovery'
import { SHARE_SIGNAL_PROTOCOL_VERSION, readShareGeneration } from './types'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export type HostNegotiateCtx = {
  getIceServers: () => Promise<RTCIceServer[]>
  sendJson: (payload: Record<string, unknown>) => void
  peerByGuestRef: MutableRefObject<Map<string, RTCPeerConnection>>
  pendingReadyGuestsRef: MutableRefObject<Set<string>>
  pendingGuestIceRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>
  /** Monotonic capture session counter; increments when host starts sharing. */
  shareGenerationRef: MutableRefObject<number>
  /** Latest offer **`shareGeneration`** actually sent per guest ICE session. */
  hostLastOfferGenByGuestRef: MutableRefObject<Map<string, number>>
  /**
   * Last host signaling milestone per guest (ms since epoch): set after host `setLocalDescription(offer)`
   * and refreshed when the guest's answer is applied — used to break `ready`/skip deadlocks.
   */
  hostNegotiationMilestoneMsByGuestRef: MutableRefObject<Map<string, number>>
}

function signalingEnvelopeExtras(shareGeneration: number): Record<string, unknown> {
  if (shareGeneration > 0) {
    return { protocolVersion: SHARE_SIGNAL_PROTOCOL_VERSION, shareGeneration }
  }
  return {}
}

function hostShouldForceRenegotiationStale(
  pc: RTCPeerConnection,
  milestoneMs: number,
): { stale: boolean; reason: string | null } {
  if (milestoneMs <= 0) return { stale: false, reason: null }
  const age = Date.now() - milestoneMs
  if (pc.signalingState === 'have-local-offer' && age > HOST_STALE_HAVE_LOCAL_OFFER_MS) {
    return { stale: true, reason: 'stale_have_local_offer' }
  }
  if (
    pc.signalingState === 'stable' &&
    pc.currentRemoteDescription != null &&
    pc.connectionState === 'connecting' &&
    age > HOST_STALE_CONNECTING_AFTER_ANSWER_MS
  ) {
    return { stale: true, reason: 'stale_connecting' }
  }
  return { stale: false, reason: null }
}

export async function ensureHostPeerNegotiated(
  ctx: HostNegotiateCtx & { captureStream: MediaStream },
  guestSessionId: string,
): Promise<void> {
  const stream = ctx.captureStream
  const existing = ctx.peerByGuestRef.current.get(guestSessionId)
  if (existing && existing.signalingState !== 'closed') {
    const milestone = ctx.hostNegotiationMilestoneMsByGuestRef.current.get(guestSessionId) ?? 0
    const { stale, reason } = hostShouldForceRenegotiationStale(existing, milestone)
    if (
      hostShouldSkipRenegotiation({
        signalingState: existing.signalingState,
        connectionState: existing.connectionState,
        hasRemoteDescription: existing.currentRemoteDescription != null,
      }) &&
      !stale
    ) {
      return
    }
    if (stale && reason !== null && import.meta.env.DEV) {
      console.warn(`[riffsync] host re-offer (${reason}) for guest ${guestSessionId.slice(0, 8)}…`)
    }
    existing.close()
    ctx.hostNegotiationMilestoneMsByGuestRef.current.delete(guestSessionId)
  }
  ctx.pendingGuestIceRef.current.delete(guestSessionId)
  const shareGen = ctx.shareGenerationRef.current
  const iceServers = await ctx.getIceServers()
  const pc = new RTCPeerConnection({ iceServers })
  attachPcStateLogging(pc, `host→${guestSessionId.slice(0, 8)}…`)
  ctx.peerByGuestRef.current.set(guestSessionId, pc)

  const getStillCurrent = () => ctx.peerByGuestRef.current.get(guestSessionId) === pc
  attachHostPcIceRecovery(pc, guestSessionId, getStillCurrent, {
    sendJson: ctx.sendJson,
    getShareGeneration: () => ctx.shareGenerationRef.current,
  })

  for (const t of stream.getTracks()) {
    pc.addTrack(t, stream)
  }
  pc.onicecandidate = (e) => {
    if (!e.candidate) return
    ctx.sendJson({
      action: 'signaling',
      envelope: {
        ...signalingEnvelopeExtras(shareGen),
        kind: 'ice',
        candidate: e.candidate.toJSON(),
        targetSessionId: guestSessionId,
      },
    })
  }

  ctx.hostLastOfferGenByGuestRef.current.set(guestSessionId, shareGen)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  ctx.hostNegotiationMilestoneMsByGuestRef.current.set(guestSessionId, Date.now())
  ctx.sendJson({
    action: 'signaling',
    envelope: {
      ...signalingEnvelopeExtras(shareGen),
      kind: 'offer',
      sdp: { type: offer.type, sdp: offer.sdp ?? '' },
      targetSessionId: guestSessionId,
    },
  })
}

export async function flushHostPending(
  opts: HostNegotiateCtx & { captureStream: MediaStream },
): Promise<void> {
  const ids = [...opts.pendingReadyGuestsRef.current]
  opts.pendingReadyGuestsRef.current.clear()
  for (const sid of ids) {
    await ensureHostPeerNegotiated(opts, sid).catch(() => undefined)
  }
}

export async function handleHostSignal(
  ctx: HostNegotiateCtx & {
    captureStream: MediaStream | null
    fromSessionId: string
    envelope: Record<string, unknown>
  },
): Promise<void> {
  const guestSignaling = ctx.envelope.guestSignaling === true
  const kind = ctx.envelope.kind

  if (guestSignaling && kind === 'ready') {
    if (!ctx.captureStream) {
      ctx.pendingReadyGuestsRef.current.add(ctx.fromSessionId)
      return
    }
    await ensureHostPeerNegotiated(
      {
        captureStream: ctx.captureStream,
        getIceServers: ctx.getIceServers,
        sendJson: ctx.sendJson,
        peerByGuestRef: ctx.peerByGuestRef,
        pendingReadyGuestsRef: ctx.pendingReadyGuestsRef,
        pendingGuestIceRef: ctx.pendingGuestIceRef,
        shareGenerationRef: ctx.shareGenerationRef,
        hostLastOfferGenByGuestRef: ctx.hostLastOfferGenByGuestRef,
        hostNegotiationMilestoneMsByGuestRef: ctx.hostNegotiationMilestoneMsByGuestRef,
      },
      ctx.fromSessionId,
    ).catch(() => undefined)
    return
  }

  const pc = ctx.peerByGuestRef.current.get(ctx.fromSessionId)
  if (!pc) return

  const envGen = readShareGeneration(ctx.envelope)
  const expected =
    envGen > 0 ? ctx.hostLastOfferGenByGuestRef.current.get(ctx.fromSessionId) : undefined

  if (guestSignaling && kind === 'answer') {
    if (expected !== undefined && envGen > 0 && envGen !== expected) return
    const sdp = ctx.envelope.sdp
    if (isRecord(sdp) && typeof sdp.sdp === 'string' && typeof sdp.type === 'string') {
      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(sdp as unknown as RTCSessionDescriptionInit),
        )
        ctx.hostNegotiationMilestoneMsByGuestRef.current.set(ctx.fromSessionId, Date.now())
        const sid = ctx.fromSessionId
        const queued = ctx.pendingGuestIceRef.current.get(sid)
        ctx.pendingGuestIceRef.current.delete(sid)
        if (queued?.length) {
          for (const init of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => undefined)
          }
        }
      } catch {
        /* ignore malformed SDP */
      }
    }
    return
  }

  if (guestSignaling && kind === 'ice') {
    if (expected !== undefined && envGen > 0 && envGen !== expected) return
    const cand = ctx.envelope.candidate
    if (!isRecord(cand)) return
    const init = cand as RTCIceCandidateInit
    if (!pc.currentRemoteDescription) {
      const m = ctx.pendingGuestIceRef
      const arr = m.current.get(ctx.fromSessionId) ?? []
      arr.push(init)
      m.current.set(ctx.fromSessionId, arr)
      return
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(init))
    } catch {
      /* ignore stale / invalid candidate */
    }
  }
}
