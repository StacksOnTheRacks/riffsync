import type { MutableRefObject } from 'react'
import { attachPcStateLogging, webrtcDebugEnabled, webrtcLog } from '../webrtcDebug'
import { SHARE_SIGNAL_PROTOCOL_VERSION, isProtocolV1, readShareGeneration } from './types'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function signalingEnvelopeExtras(shareGeneration: number): Record<string, unknown> {
  if (shareGeneration > 0) {
    return { protocolVersion: SHARE_SIGNAL_PROTOCOL_VERSION, shareGeneration }
  }
  return {}
}

/** Generation from the latest **accepted** host offer (guest trickle/session guard). */
export type GuestSignalingRefs = {
  guestPcRef: MutableRefObject<RTCPeerConnection | null>
  pendingIceRef: MutableRefObject<RTCIceCandidateInit[]>
  acceptedOfferShareGenerationRef: MutableRefObject<number>
  lastDedupOfferGenerationRef: MutableRefObject<number>
}

export async function handleGuestSignal(ctx: {
  mySessionId: string
  getIceServers: () => Promise<RTCIceServer[]>
  sendJson: (payload: Record<string, unknown>) => void
  refs: GuestSignalingRefs
  setGuestRemote: (s: MediaStream | null) => void
  envelope: Record<string, unknown>
}): Promise<void> {
  const { guestPcRef, pendingIceRef, acceptedOfferShareGenerationRef, lastDedupOfferGenerationRef } =
    ctx.refs

  const kind = ctx.envelope.kind

  if (kind === 'offer') {
    if (ctx.envelope.targetSessionId !== ctx.mySessionId) return
    const sdp = ctx.envelope.sdp
    if (!isRecord(sdp) || typeof sdp.sdp !== 'string' || typeof sdp.type !== 'string') return

    const envelopeGen = readShareGeneration(ctx.envelope)
    const useV1 = isProtocolV1(ctx.envelope)
    const currentPc = guestPcRef.current

    if (useV1 && envelopeGen > 0 && currentPc) {
      const stable =
        currentPc.signalingState === 'stable' && currentPc.currentRemoteDescription != null
      const okConn =
        currentPc.connectionState === 'connected' || currentPc.connectionState === 'connecting'
      const dupOffer =
        envelopeGen === lastDedupOfferGenerationRef.current &&
        envelopeGen === acceptedOfferShareGenerationRef.current
      if (dupOffer && stable && okConn) {
        return
      }
    }

    const prev = guestPcRef.current
    /** If we only `close()` the previous PC, its `closed` handler can still see `guestPcRef === prev` until the new PC is assigned (after `await getIceServers`), and would wipe refs / remote video mid-handshake. */
    guestPcRef.current = null
    prev?.close()
    if (prev) pendingIceRef.current = []

    acceptedOfferShareGenerationRef.current = envelopeGen
    lastDedupOfferGenerationRef.current = envelopeGen

    const replyGen = acceptedOfferShareGenerationRef.current

    const iceServers = await ctx.getIceServers()
    const pc = new RTCPeerConnection({ iceServers })
    attachPcStateLogging(pc, 'guest')
    guestPcRef.current = pc

    pc.ontrack = (ev) => {
      const stream =
        ev.streams[0] ??
        (() => {
          const ms = new MediaStream()
          ms.addTrack(ev.track)
          return ms
        })()
      ctx.setGuestRemote(stream)
      if (webrtcDebugEnabled()) {
        webrtcLog('guest ontrack', {
          trackKind: ev.track.kind,
          streamsLen: ev.streams.length,
          trackReadyState: ev.track.readyState,
        })
      }
    }
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      ctx.sendJson({
        action: 'signaling',
        envelope: {
          ...signalingEnvelopeExtras(replyGen),
          guestSignaling: true,
          kind: 'ice',
          candidate: e.candidate.toJSON(),
        },
      })
    }

    let disconnectTimer: ReturnType<typeof setTimeout> | null = null
    const clearDisconnectTimer = () => {
      if (disconnectTimer !== null) {
        clearTimeout(disconnectTimer)
        disconnectTimer = null
      }
    }
    const teardownGuestPeer = () => {
      clearDisconnectTimer()
      pendingIceRef.current = []
      guestPcRef.current = null
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      acceptedOfferShareGenerationRef.current = 0
      lastDedupOfferGenerationRef.current = 0
      ctx.setGuestRemote(null)
    }
    let sawConnected = false
    pc.onconnectionstatechange = () => {
      if (pc !== guestPcRef.current) return
      const s = pc.connectionState
      if (s === 'failed') {
        teardownGuestPeer()
        return
      }
      if (s === 'closed') {
        teardownGuestPeer()
        return
      }
      if (s === 'disconnected') {
        if (!sawConnected) {
          /* Initial ICE can sit in `disconnected` for a bit; do not tear down before first `connected`. */
          return
        }
        clearDisconnectTimer()
        disconnectTimer = globalThis.setTimeout(() => {
          disconnectTimer = null
          if (pc !== guestPcRef.current) return
          const cur = guestPcRef.current
          if (!cur) return
          if (cur.connectionState === 'connected' || cur.connectionState === 'connecting') return
          teardownGuestPeer()
        }, 1500)
        return
      }
      if (s === 'connected') {
        sawConnected = true
        clearDisconnectTimer()
      }
    }

    try {
      await pc.setRemoteDescription(
        new RTCSessionDescription(sdp as unknown as RTCSessionDescriptionInit),
      )
      while (pendingIceRef.current.length > 0) {
        const batch = pendingIceRef.current.splice(0)
        for (const init of batch) {
          await pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => undefined)
        }
      }
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      ctx.sendJson({
        action: 'signaling',
        envelope: {
          ...signalingEnvelopeExtras(replyGen),
          guestSignaling: true,
          kind: 'answer',
          sdp: { type: answer.type, sdp: answer.sdp ?? '' },
        },
      })
    } catch (e) {
      if (webrtcDebugEnabled()) webrtcLog('guest SDP handshake failed', e)
    }
    return
  }

  if (kind === 'ice' && ctx.envelope.targetSessionId === ctx.mySessionId) {
    const candGen = readShareGeneration(ctx.envelope)
    const sessionGen = acceptedOfferShareGenerationRef.current
    if (candGen > 0 && sessionGen > 0 && candGen !== sessionGen) return

    const cand = ctx.envelope.candidate
    if (!isRecord(cand)) return
    const init = cand as RTCIceCandidateInit
    const rpc = guestPcRef.current
    if (!rpc) {
      pendingIceRef.current.push(init)
      return
    }
    if (!rpc.remoteDescription) {
      pendingIceRef.current.push(init)
      return
    }
    try {
      await rpc.addIceCandidate(new RTCIceCandidate(init))
    } catch {
      /* ignore */
    }
  }
}
