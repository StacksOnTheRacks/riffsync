// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { applyParticipantAvConsumerEvent } from './participantAvConsumers'
import type { ParticipantAvVideoConsumer } from './participantAvConsumers'
import {
  VIDEO_CHAT_EMPTY_COPY,
  buildStageParticipantTiles,
  sortRosterForStage,
  stageLayoutSurfaceClass,
  stageLayoutUsesDesktopStrip,
  stageLayoutUsesNarrowRow,
} from './stageParticipantTiles'

function consumer(
  producerId: string,
  sessionId: string,
): ParticipantAvVideoConsumer {
  return {
    producerId,
    sessionId,
    track: { kind: 'video' } as MediaStreamTrack,
  }
}

describe('stageParticipantTiles', () => {
  const roster = [
    { sessionId: 'host-1', displayName: 'Host', isHost: true },
    { sessionId: 'fan-a', displayName: 'Alice', isHost: false },
    { sessionId: 'fan-b', displayName: 'Bob', isHost: false },
  ]

  it('orders roster with host first then display name', () => {
    const shuffled = [roster[2], roster[1], roster[0]]
    const sorted = sortRosterForStage(shuffled)
    expect(sorted.map((m) => m.sessionId)).toEqual(['host-1', 'fan-a', 'fan-b'])
  })

  it('includes self You tile when local camera is on', () => {
    const local = new MediaStream([{ kind: 'video' } as MediaStreamTrack])
    const tiles = buildStageParticipantTiles({
      roster,
      videoConsumers: new Map(),
      ownSessionId: 'fan-a',
      localCameraOn: true,
      localPreviewStream: local,
    })
    expect(tiles).toHaveLength(1)
    expect(tiles[0]?.label).toBe('You')
    expect(tiles[0]?.isSelf).toBe(true)
  })

  it('excludes mic-only participants without video consumers', () => {
    const tiles = buildStageParticipantTiles({
      roster,
      videoConsumers: new Map([['p1', consumer('p1', 'fan-b')]]),
      ownSessionId: 'fan-a',
      localCameraOn: false,
      localPreviewStream: null,
    })
    expect(tiles.map((t) => t.sessionId)).toEqual(['fan-b'])
  })

  it('removes remote participant tile after video consumer detach', () => {
    const track = { kind: 'video' } as MediaStreamTrack
    let videoConsumers = applyParticipantAvConsumerEvent(new Map(), {
      action: 'attach',
      producerId: 'p1',
      sessionId: 'fan-b',
      producerClass: 'participant_av',
      kind: 'video',
      track,
    })
    const tileArgs = {
      roster,
      videoConsumers,
      ownSessionId: 'fan-a',
      localCameraOn: false,
      localPreviewStream: null,
    }
    expect(buildStageParticipantTiles(tileArgs).map((t) => t.sessionId)).toEqual(['fan-b'])

    videoConsumers = applyParticipantAvConsumerEvent(videoConsumers, {
      action: 'detach',
      producerId: 'p1',
    })
    expect(
      buildStageParticipantTiles({ ...tileArgs, videoConsumers }).map((t) => t.sessionId),
    ).toEqual([])
  })

  it('orders tiles by roster join order', () => {
    const tiles = buildStageParticipantTiles({
      roster,
      videoConsumers: new Map([
        ['p-host', consumer('p-host', 'host-1')],
        ['p-b', consumer('p-b', 'fan-b')],
      ]),
      ownSessionId: 'fan-a',
      localCameraOn: false,
      localPreviewStream: null,
    })
    expect(tiles.map((t) => t.sessionId)).toEqual(['host-1', 'fan-b'])
  })

  it('keeps a stable MediaStream identity per remote track across rebuilds', () => {
    const videoConsumers = new Map([['p1', consumer('p1', 'fan-b')]])
    const args = {
      roster,
      videoConsumers,
      ownSessionId: 'fan-a',
      localCameraOn: false,
      localPreviewStream: null,
    }
    const first = buildStageParticipantTiles(args)
    const second = buildStageParticipantTiles(args)
    expect(first[0]?.stream).toBe(second[0]?.stream)
  })

  it('uses a different MediaStream when the remote track changes', () => {
    const base = {
      roster,
      ownSessionId: 'fan-a',
      localCameraOn: false,
      localPreviewStream: null,
    }
    const firstTiles = buildStageParticipantTiles({
      ...base,
      videoConsumers: new Map([['p1', consumer('p1', 'fan-b')]]),
    })
    const secondTiles = buildStageParticipantTiles({
      ...base,
      videoConsumers: new Map([['p2', consumer('p2', 'fan-b')]]),
    })
    expect(firstTiles[0]?.stream).not.toBe(secondTiles[0]?.stream)
  })

  it('exposes video chat empty copy constant', () => {
    expect(VIDEO_CHAT_EMPTY_COPY).toContain('No cameras on yet')
    expect(VIDEO_CHAT_EMPTY_COPY).toContain('Mic-only')
  })

  it('selects layout surface class by room mode', () => {
    expect(stageLayoutSurfaceClass('theater')).toBe('riffsync-room-page__stage-media--theater')
    expect(stageLayoutSurfaceClass('videoChat')).toBe('riffsync-room-page__stage-media--video-chat')
  })

  it('uses narrow row only below desktop breakpoint', () => {
    expect(stageLayoutUsesNarrowRow(false)).toBe(true)
    expect(stageLayoutUsesNarrowRow(true)).toBe(false)
  })

  it('uses desktop strip only in theater with tiles on wide viewport', () => {
    expect(stageLayoutUsesDesktopStrip(true, 'theater', 2)).toBe(true)
    expect(stageLayoutUsesDesktopStrip(true, 'videoChat', 2)).toBe(false)
    expect(stageLayoutUsesDesktopStrip(true, 'theater', 0)).toBe(false)
    expect(stageLayoutUsesDesktopStrip(false, 'theater', 2)).toBe(false)
  })
})
