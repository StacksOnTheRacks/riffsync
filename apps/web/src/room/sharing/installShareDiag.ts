import type { MutableRefObject } from 'react'
import { collectInboundVideoHealth, summarizePeerPcLite } from '../shareDiag'
import type { ShareSessionFsm } from './shareSessionFsm'

export type ShareDiagSnapshot = {
  ts: number
  role: 'host' | 'guest'
  shareGeneration: number
  shareFsm: ShareSessionFsm
  /** Host: abbreviated sessionId → state string; guest: single PC field map. */
  peerStateSummary: Record<string, string> | null
  /** Guest: inbound video stats; host: per-PC connection summary (no packets). */
  mediaOrTransportSummary: Record<string, unknown> | null
}

declare global {
  interface Window {
    __riffsyncShareDiag?: {
      dump(): Promise<{ redactedSupportBundle: ShareDiagSnapshot[] }>
    }
  }
}

function redactSid(sid: string): string {
  if (sid.length <= 8) return '…'
  return `${sid.slice(0, 6)}…`
}

export function installShareDiagnostics(opts: {
  isPublisherRef: MutableRefObject<boolean>
  shareGenerationRef: MutableRefObject<number>
  deriveShareFsm: () => ShareSessionFsm
  guestPcRef: MutableRefObject<RTCPeerConnection | null>
  peerByGuestRef: MutableRefObject<Map<string, RTCPeerConnection>>
}): () => void {
  window.__riffsyncShareDiag = {
    dump: async () => {
      const ts = Date.now()
      const role = opts.isPublisherRef.current ? ('host' as const) : ('guest' as const)
      const shareGeneration = opts.shareGenerationRef.current
      const shareFsm = opts.deriveShareFsm()
      const sheet: ShareDiagSnapshot[] = []

      if (role === 'guest') {
        const pc = opts.guestPcRef.current
        let peerSummary: Record<string, string> | null = null
        let media: Record<string, unknown> | null = null
        if (pc && pc.connectionState !== 'closed') {
          const lite = await summarizePeerPcLite(pc)
          peerSummary = Object.fromEntries(Object.entries(lite).map(([k, v]) => [k, String(v)]))
          media = {
            ...(await collectInboundVideoHealth(pc)),
          }
        }
        sheet.push({
          ts,
          role,
          shareGeneration,
          shareFsm,
          peerStateSummary: peerSummary,
          mediaOrTransportSummary: media,
        })
      } else {
        const m = opts.peerByGuestRef.current
        const guestPcStates: Record<string, string> = {}
        const transport: Record<string, unknown> = {}
        let i = 0
        for (const [sid, pc] of m) {
          if (pc.signalingState === 'closed') continue
          guestPcStates[redactSid(sid)] = `${pc.connectionState}/${pc.iceConnectionState}`
          const lite = await summarizePeerPcLite(pc)
          for (const [k, v] of Object.entries(lite)) {
            transport[`peer${i}_${k}`] = String(v)
          }
          i += 1
        }
        sheet.push({
          ts,
          role,
          shareGeneration,
          shareFsm,
          peerStateSummary: Object.keys(guestPcStates).length ? guestPcStates : null,
          mediaOrTransportSummary:
            Object.keys(transport).length > 0 ? transport : { note: 'no_active_host_pcs_sampled' },
        })
      }

      return { redactedSupportBundle: sheet }
    },
  }

  return () => {
    if (window.__riffsyncShareDiag) delete window.__riffsyncShareDiag
  }
}
