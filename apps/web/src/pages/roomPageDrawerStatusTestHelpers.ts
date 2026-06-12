import type { RoomRealtimeDiagnostics } from '../room/sessions/RoomRealtimeSdk'

/** Retired anti-pattern from `.ai/interface/presentation.md` (#147 / #150). */
export const RETIRED_COMBINED_STATUS_COPY = 'Reconnecting chat… Video may pause briefly.'

export const CHAT_RECONNECTING_COPY = 'Reconnecting chat…'
export const VIDEO_RELAY_RECONNECTING_COPY = 'Video relay reconnecting…'
export const GUEST_IDLE_VIDEO_RELAY_COPY = 'Waiting for host to share…'

export function drawerDiagnostics(
  drawers: Partial<RoomRealtimeDiagnostics['drawers']>,
  activeErrorCodes: string[] = [],
): RoomRealtimeDiagnostics {
  return {
    roomId: 'room-test-1',
    sessionId: 'sess-test-1',
    asOf: new Date(0).toISOString(),
    drawers: {
      chat: { state: 'connected' },
      sfuSignaling: { state: 'connected' },
      theaterPlayback: { state: 'connected' },
      ...drawers,
    },
    activeErrorCodes,
  }
}
