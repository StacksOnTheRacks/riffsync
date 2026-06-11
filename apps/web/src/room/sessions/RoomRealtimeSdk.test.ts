import { describe, expect, it } from 'vitest'
import type { RoomSnapshot } from '../../api/roomsApi'
import {
  DRAWER_LIFECYCLE_STATES,
  RoomRealtimeSdk,
  mapChatSessionStatusToDrawerState,
  mapSfuMediaSessionStatusToDrawerState,
  type RoomRealtimeDiagnostics,
} from './RoomRealtimeSdk'

const baseSnapshot: RoomSnapshot = {
  roomId: 'room-abc',
  hostSub: 'host-sub',
  catalogEpisodeId: 'ep-1',
  youtubeVideoId: 'yt-1',
  playbackExpectation: 'free',
  visibility: 'public',
  lastActivityAt: 1,
  version: 1,
  roomMode: 'theater',
  avDisabled: false,
  broadcastCaptureActive: false,
}

const REQUIRED_DIAGNOSTIC_KEYS = [
  'roomId',
  'sessionId',
  'asOf',
  'drawers',
  'activeErrorCodes',
] as const satisfies readonly (keyof RoomRealtimeDiagnostics)[]

const REQUIRED_DRAWER_KEYS = ['chat', 'sfuSignaling', 'theaterPlayback'] as const

function assertStableDiagnosticsContract(diag: RoomRealtimeDiagnostics): void {
  for (const key of REQUIRED_DIAGNOSTIC_KEYS) {
    expect(diag).toHaveProperty(key)
  }

  for (const drawerKey of REQUIRED_DRAWER_KEYS) {
    expect(diag.drawers).toHaveProperty(drawerKey)
    expect(diag.drawers[drawerKey]).toHaveProperty('state')
    expect(DRAWER_LIFECYCLE_STATES).toContain(diag.drawers[drawerKey].state)
  }

  expect(Array.isArray(diag.activeErrorCodes)).toBe(true)
  expect(diag.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/)
}

describe('RoomRealtimeSdk lifecycle mappers', () => {
  it('maps chat session statuses to drawer lifecycle enum strings', () => {
    expect(mapChatSessionStatusToDrawerState('open')).toBe('connected')
    expect(mapChatSessionStatusToDrawerState('connecting')).toBe('reconnecting')
    expect(mapChatSessionStatusToDrawerState('error')).toBe('degraded')
    expect(mapChatSessionStatusToDrawerState('idle')).toBe('torn-down')
    expect(mapChatSessionStatusToDrawerState('closed')).toBe('torn-down')
  })

  it('maps SFU session statuses to drawer lifecycle enum strings', () => {
    expect(mapSfuMediaSessionStatusToDrawerState('open')).toBe('connected')
    expect(mapSfuMediaSessionStatusToDrawerState('connecting')).toBe('reconnecting')
    expect(mapSfuMediaSessionStatusToDrawerState('reconnecting')).toBe('reconnecting')
    expect(mapSfuMediaSessionStatusToDrawerState('error')).toBe('degraded')
    expect(mapSfuMediaSessionStatusToDrawerState('idle')).toBe('torn-down')
    expect(mapSfuMediaSessionStatusToDrawerState('closed')).toBe('torn-down')
  })
})

describe('RoomRealtimeSdk.getDiagnostics', () => {
  it('returns stable JSON field names before join', () => {
    const sdk = new RoomRealtimeSdk()
    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.drawers.chat.state).toBe('torn-down')
    expect(diag.drawers.sfuSignaling.state).toBe('torn-down')
    expect(diag.drawers.theaterPlayback.state).toBe('torn-down')
    expect(diag.activeErrorCodes).toEqual([])
  })

  it('returns stable diagnostics shape after join with theater layout', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-diag-1',
    })

    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.roomId).toBe('room-abc')
    expect(diag.sessionId).toBe('sess-diag-1')
    expect(diag.drawers.theaterPlayback.state).toBe('connected')
  })

  it('marks theater drawer torn-down when layout is video chat', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: { ...baseSnapshot, roomMode: 'videoChat' },
      sessionId: 'sess-diag-2',
    })

    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.drawers.theaterPlayback.state).toBe('torn-down')
  })

  it('matches diagnostics contract snapshot for harness assertions', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-snapshot',
    })

    const diag = sdk.getDiagnostics()
    expect({
      topLevelKeys: REQUIRED_DIAGNOSTIC_KEYS.slice().sort(),
      drawerKeys: REQUIRED_DRAWER_KEYS.slice().sort(),
      lifecycleStates: DRAWER_LIFECYCLE_STATES.slice(),
      sample: {
        roomId: diag.roomId,
        sessionId: diag.sessionId,
        drawers: {
          chat: { state: diag.drawers.chat.state },
          sfuSignaling: { state: diag.drawers.sfuSignaling.state },
          theaterPlayback: { state: diag.drawers.theaterPlayback.state },
        },
        activeErrorCodes: diag.activeErrorCodes,
      },
    }).toMatchInlineSnapshot(`
      {
        "drawerKeys": [
          "chat",
          "sfuSignaling",
          "theaterPlayback",
        ],
        "lifecycleStates": [
          "connected",
          "reconnecting",
          "degraded",
          "torn-down",
        ],
        "sample": {
          "activeErrorCodes": [],
          "drawers": {
            "chat": {
              "state": "torn-down",
            },
            "sfuSignaling": {
              "state": "torn-down",
            },
            "theaterPlayback": {
              "state": "connected",
            },
          },
          "roomId": "room-abc",
          "sessionId": "sess-snapshot",
        },
        "topLevelKeys": [
          "activeErrorCodes",
          "asOf",
          "drawers",
          "roomId",
          "sessionId",
        ],
      }
    `)
  })
})

describe('RoomRealtimeSdk public surface', () => {
  it('exposes join, publishAv, subscribe, getDiagnostics, and teardown', () => {
    const sdk = new RoomRealtimeSdk()
    expect(typeof sdk.join).toBe('function')
    expect(typeof sdk.publishAv).toBe('function')
    expect(typeof sdk.subscribe).toBe('function')
    expect(typeof sdk.getDiagnostics).toBe('function')
    expect(typeof sdk.teardown).toBe('function')
  })

  it('teardown resets diagnostics to torn-down drawers', () => {
    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', {
      roomSnapshot: baseSnapshot,
      sessionId: 'sess-teardown',
    })
    sdk.teardown()

    const diag = sdk.getDiagnostics()
    assertStableDiagnosticsContract(diag)
    expect(diag.roomId).toBe('')
    expect(diag.sessionId).toBe('')
    expect(diag.drawers.chat.state).toBe('torn-down')
    expect(diag.drawers.sfuSignaling.state).toBe('torn-down')
    expect(diag.drawers.theaterPlayback.state).toBe('torn-down')
  })
})
