import type { ParticipantAvPublishState } from './sfu/participantAvSession'

export type ParticipantProducerSnapshot = {
  hasVideoProducer: boolean
  hasAudioProducer: boolean
  audioPaused: boolean
}

export const EMPTY_PARTICIPANT_PRODUCER_SNAPSHOT: ParticipantProducerSnapshot = {
  hasVideoProducer: false,
  hasAudioProducer: false,
  audioPaused: false,
}

type ProducerRow = {
  sessionId: string
  kind: 'audio' | 'video'
  audioPaused: boolean
}

export type ParticipantProducerRegistryState = {
  byProducerId: Map<string, ProducerRow>
}

export function createParticipantProducerRegistryState(): ParticipantProducerRegistryState {
  return { byProducerId: new Map() }
}

export function applyProducerOpened(
  state: ParticipantProducerRegistryState,
  producerId: string,
  sessionId: string,
  kind: 'audio' | 'video',
): ParticipantProducerRegistryState {
  const next = new Map(state.byProducerId)
  next.set(producerId, { sessionId, kind, audioPaused: false })
  return { byProducerId: next }
}

export function applyProducerClosed(
  state: ParticipantProducerRegistryState,
  producerId: string,
): ParticipantProducerRegistryState {
  if (!state.byProducerId.has(producerId)) return state
  const next = new Map(state.byProducerId)
  next.delete(producerId)
  return { byProducerId: next }
}

export function applyAudioProducerPaused(
  state: ParticipantProducerRegistryState,
  producerId: string,
  paused: boolean,
): ParticipantProducerRegistryState {
  const row = state.byProducerId.get(producerId)
  if (!row || row.kind !== 'audio') return state
  const next = new Map(state.byProducerId)
  next.set(producerId, { ...row, audioPaused: paused })
  return { byProducerId: next }
}

export function clearParticipantProducerRegistry(): ParticipantProducerRegistryState {
  return createParticipantProducerRegistryState()
}

export function snapshotForSession(
  state: ParticipantProducerRegistryState,
  sessionId: string,
  localOverride?: ParticipantProducerSnapshot | null,
): ParticipantProducerSnapshot {
  if (localOverride) return localOverride

  let hasVideoProducer = false
  let hasAudioProducer = false
  let audioPaused = false

  for (const row of state.byProducerId.values()) {
    if (row.sessionId !== sessionId) continue
    if (row.kind === 'video') hasVideoProducer = true
    if (row.kind === 'audio') {
      hasAudioProducer = true
      if (row.audioPaused) audioPaused = true
    }
  }

  return { hasVideoProducer, hasAudioProducer, audioPaused }
}

export function localSnapshotFromParticipantAv(
  state: ParticipantAvPublishState,
): ParticipantProducerSnapshot {
  return {
    hasVideoProducer: state.cameraEnabled,
    hasAudioProducer: state.micEnabled,
    audioPaused: state.micEnabled && state.micMuted,
  }
}

export function buildParticipantProducerSnapshots(
  state: ParticipantProducerRegistryState,
  sessionIds: readonly string[],
  ownSessionId: string,
  localAvState: ParticipantAvPublishState,
): Map<string, ParticipantProducerSnapshot> {
  const localSnapshot = localSnapshotFromParticipantAv(localAvState)
  const out = new Map<string, ParticipantProducerSnapshot>()
  for (const sessionId of sessionIds) {
    const override = sessionId === ownSessionId ? localSnapshot : null
    out.set(sessionId, snapshotForSession(state, sessionId, override))
  }
  return out
}
