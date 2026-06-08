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

export function sortRosterForStage(members: RosterMember[]): RosterMember[] {
  return [...members].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
  })
}

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

function memberHasVideoOn(opts: {
  member: RosterMember
  ownSessionId: string
  localCameraOn: boolean
  remoteBySession: Map<string, ParticipantAvVideoConsumer>
}): boolean {
  if (opts.member.sessionId === opts.ownSessionId) {
    return opts.localCameraOn
  }
  return opts.remoteBySession.has(opts.member.sessionId)
}

export function buildStageParticipantTiles(opts: {
  roster: RosterMember[]
  videoConsumers: Map<string, ParticipantAvVideoConsumer>
  ownSessionId: string
  localCameraOn: boolean
  localPreviewStream: MediaStream | null
}): StageParticipantTile[] {
  const remoteBySession = videoConsumersBySession(opts.videoConsumers.values())
  const ordered = sortRosterForStage(opts.roster)
  const tiles: StageParticipantTile[] = []

  for (const member of ordered) {
    if (
      !memberHasVideoOn({
        member,
        ownSessionId: opts.ownSessionId,
        localCameraOn: opts.localCameraOn,
        remoteBySession,
      })
    ) {
      continue
    }

    const isSelf = member.sessionId === opts.ownSessionId
    let stream: MediaStream | null = null
    if (isSelf) {
      stream = opts.localPreviewStream
    } else {
      const remote = remoteBySession.get(member.sessionId)
      if (remote) {
        stream = new MediaStream([remote.track])
      }
    }
    if (!stream || stream.getVideoTracks().length === 0) continue

    tiles.push({
      key: isSelf ? 'self' : member.sessionId,
      sessionId: member.sessionId,
      label: isSelf ? 'You' : member.displayName,
      isSelf,
      stream,
    })
  }

  return tiles
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
