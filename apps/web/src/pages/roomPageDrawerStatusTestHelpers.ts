import type { RoomRealtimeDiagnostics } from '../room/sessions/RoomRealtimeSdk'

/** Retired anti-pattern from `.ai/interface/presentation.md` (#147 / #150). */
export const RETIRED_COMBINED_STATUS_COPY = 'Reconnecting chat… Video may pause briefly.'

/** Retired duplicate guest placeholder from **#211** / parent **#151**. */
export const RETIRED_GUEST_NOT_SHARING_PLACEHOLDER = 'The host is not sharing video right now.'

export const CHAT_RECONNECTING_COPY = 'Reconnecting chat…'
export const VIDEO_RELAY_RECONNECTING_COPY = 'Video relay reconnecting…'
export const GUEST_IDLE_VIDEO_RELAY_COPY = 'Waiting for host to share…'
export const GUEST_VERIFYING_VIDEO_RELAY_COPY = 'Connecting to video relay…'

/** Retired mesh-era guest host-screen strings (`interaction_flow.md` / #151). */
export const RETIRED_MESH_HOST_SCREEN_COPY = [
  'negotiating_ice',
  'recovering_ice',
  'Establishing encrypted path…',
  'Verifying video feed…',
  'shareSessionFsm',
  'isMeshWatchPartyMediaEnabled',
  'VITE_WEBRTC_USE_MEDIASOU_SFU',
] as const

type DrawerDiagnosticsOverrides = Partial<
  Omit<RoomRealtimeDiagnostics['drawers'], 'sfuSignaling'>
> & {
  sfuSignaling?: Partial<RoomRealtimeDiagnostics['drawers']['sfuSignaling']>
}

export function drawerDiagnostics(
  drawers: DrawerDiagnosticsOverrides,
  activeErrorCodes: string[] = [],
): RoomRealtimeDiagnostics {
  const defaultSfuSignaling: RoomRealtimeDiagnostics['drawers']['sfuSignaling'] = {
    state: 'connected',
    health: {
      connectivity: { state: 'connected' },
      produceConsume: {
        state: 'connected',
        producerCount: 0,
        consumerCount: 0,
        hostScreenAttached: false,
        participantAvPublishActive: false,
      },
    },
  }

  return {
    roomId: 'room-test-1',
    sessionId: 'sess-test-1',
    asOf: new Date(0).toISOString(),
    drawers: {
      chat: { state: 'connected' },
      sfuSignaling: {
        ...defaultSfuSignaling,
        ...drawers.sfuSignaling,
        health: {
          connectivity:
            drawers.sfuSignaling?.health?.connectivity ?? defaultSfuSignaling.health.connectivity,
          produceConsume:
            drawers.sfuSignaling?.health?.produceConsume ??
            defaultSfuSignaling.health.produceConsume,
        },
      },
      theaterPlayback: { state: 'connected' },
      ...(drawers.chat ? { chat: drawers.chat } : {}),
      ...(drawers.theaterPlayback ? { theaterPlayback: drawers.theaterPlayback } : {}),
    },
    activeErrorCodes,
  }
}
