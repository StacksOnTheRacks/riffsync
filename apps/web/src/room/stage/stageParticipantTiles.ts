import type { ParticipantAvVideoConsumer } from './participantAvConsumers'

export type RosterMember = {
  sessionId: string
  displayName: string
  isHost: boolean
}

export type StageParticipantTile = {
  key: string
  sessionId: string
  label: string
  isSelf: boolean
  stream: MediaStream
}

export const VIDEO_CHAT_EMPTY_COPY =
  'No cameras on yet. Mic-only participants are still audible.'

export const LAYOUT_UPDATING_COPY = 'Updating room layout…'

/**
 * Stable `MediaStream` identity per remote track. `buildStageParticipantTiles`
 * runs in render, so wrapping a track in a fresh `new MediaStream([track])` each
 * call would change the tile's stream identity every render and make
 * `ParticipantVideoTile` re-attach `srcObject` + call `play()` repeatedly
 * (flicker, AbortError churn). Keyed by track so a new producer yields a new stream.
 */
const streamByTrack = new WeakMap<MediaStreamTrack, MediaStream>()

function streamForTrack(track: MediaStreamTrack): MediaStream {
  let stream = streamByTrack.get(track)
  if (!stream) {
    stream = new MediaStream([track])
    streamByTrack.set(track, stream)
  }
  return stream
}

export function sortRosterForStage(members: RosterMember[]): RosterMember[] {
  return [...members].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  })
}

/** Fallback label for a live remote camera whose owner is not (yet) in the presence roster. */
export const UNKNOWN_PARTICIPANT_LABEL = 'Guest'

function videoConsumersBySession(
  consumers: Iterable<ParticipantAvVideoConsumer>,
): Map<string, ParticipantAvVideoConsumer> {
  const bySession = new Map<string, ParticipantAvVideoConsumer>()
  for (const row of consumers) {
    const sid = row.sessionId?.trim()
    if (!sid) continue
    bySession.set(sid, row)
  }
  return bySession
}

type StageTileDraft = {
  sessionId: string
  isHost: boolean
  label: string
  isSelf: boolean
  stream: MediaStream
}

/**
 * Build the camera tiles for the stage. Remote tiles are driven by live
 * `participant_av` video consumers, NOT by a presence-roster join: if we are
 * actively consuming someone's camera we must render it even when the roster is
 * momentarily out of sync (e.g. during a guest's consumer->producer reconnect,
 * which otherwise left the host consuming the guest yet showing only itself).
 * The roster still supplies display name and host ordering when available.
 */
export function buildStageParticipantTiles(opts: {
  roster: RosterMember[]
  videoConsumers: Map<string, ParticipantAvVideoConsumer>
  ownSessionId: string
  localCameraOn: boolean
  localPreviewStream: MediaStream | null
}): StageParticipantTile[] {
  const remoteBySession = videoConsumersBySession(opts.videoConsumers.values())
  const rosterBySession = new Map<string, RosterMember>()
  for (const member of opts.roster) rosterBySession.set(member.sessionId, member)

  const drafts: StageTileDraft[] = []

  if (
    opts.localCameraOn &&
    opts.localPreviewStream &&
    opts.localPreviewStream.getVideoTracks().length > 0
  ) {
    drafts.push({
      sessionId: opts.ownSessionId,
      isHost: rosterBySession.get(opts.ownSessionId)?.isHost ?? false,
      label: 'You',
      isSelf: true,
      stream: opts.localPreviewStream,
    })
  }

  for (const [sessionId, remote] of remoteBySession) {
    if (sessionId === opts.ownSessionId) continue
    const stream = streamForTrack(remote.track)
    if (stream.getVideoTracks().length === 0) continue
    const member = rosterBySession.get(sessionId)
    drafts.push({
      sessionId,
      isHost: member?.isHost ?? false,
      label: member?.displayName ?? UNKNOWN_PARTICIPANT_LABEL,
      isSelf: false,
      stream,
    })
  }

  drafts.sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  })

  return drafts.map((draft) => ({
    key: draft.isSelf ? 'self' : draft.sessionId,
    sessionId: draft.sessionId,
    label: draft.label,
    isSelf: draft.isSelf,
    stream: draft.stream,
  }))
}

export function stageLayoutSurfaceClass(roomMode: 'theater' | 'videoChat'): string {
  return roomMode === 'videoChat'
    ? 'riffsync-room-page__stage-media--video-chat'
    : 'riffsync-room-page__stage-media--theater'
}

export function stageLayoutUsesNarrowRow(viewportWide: boolean): boolean {
  return !viewportWide
}

export function stageLayoutUsesDesktopStrip(
  viewportWide: boolean,
  roomMode: 'theater' | 'videoChat',
  tileCount: number,
): boolean {
  return viewportWide && roomMode === 'theater' && tileCount > 0
}
