import type { SfuProducerClass } from '../sfu/mediasoupSharing'
import type { ParticipantAvController } from '../sfu/participantAvSession'

export type SfuTokenRequest =
  | { role: 'consumer' }
  | { role: 'producer'; producerClasses: SfuProducerClass[] }

/**
 * Resolve the SFU token mint request. Hosts request both producer classes up front
 * so screen share and camera/mic can publish on one session without remint.
 */
export function resolveSfuTokenRequest(opts: {
  participantAv: ParticipantAvController
  getHostScreenStream: () => MediaStream | null
  isHost: boolean
}): SfuTokenRequest {
  const needsAv = opts.participantAv.getState().needsProducerToken
  const hasLiveScreen =
    opts.getHostScreenStream()?.getTracks().some((track) => track.readyState === 'live') ?? false

  if (opts.isHost) {
    return { role: 'producer', producerClasses: ['host_screen', 'participant_av'] }
  }

  if (needsAv) {
    return { role: 'producer', producerClasses: ['participant_av'] }
  }

  if (hasLiveScreen) {
    return { role: 'producer', producerClasses: ['host_screen'] }
  }

  return { role: 'consumer' }
}

/** @deprecated Use resolveSfuTokenRequest. Kept for tests referencing legacy single-class shape. */
export function resolveSfuTokenProducerClass(opts: {
  participantAv: ParticipantAvController
  getHostScreenStream: () => MediaStream | null
  isHost?: boolean
}): SfuProducerClass | undefined {
  const request = resolveSfuTokenRequest({ ...opts, isHost: opts.isHost === true })
  if (request.role === 'consumer') return undefined
  const hasLiveScreen =
    opts.getHostScreenStream()?.getTracks().some((track) => track.readyState === 'live') ?? false
  if (hasLiveScreen) return 'host_screen'
  return request.producerClasses[0]
}
