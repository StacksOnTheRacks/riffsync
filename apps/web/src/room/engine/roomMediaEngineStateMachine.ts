export type RoomMediaConnectionPhase =
  | 'idle'
  | 'wsConnecting'
  | 'wsReady'
  | 'tokenMint'
  | 'sfuConnecting'
  | 'ready'
  | 'degraded'
  | 'reconnecting'
  | 'tornDown'

export type RoomMediaConnectionState = {
  phase: RoomMediaConnectionPhase
  /** Monotonic counter bumped on every phase transition for diagnostics. */
  generation: number
}

export function initialRoomMediaConnectionState(): RoomMediaConnectionState {
  return { phase: 'idle', generation: 0 }
}

export function transitionRoomMediaConnection(
  state: RoomMediaConnectionState,
  phase: RoomMediaConnectionPhase,
): RoomMediaConnectionState {
  if (state.phase === phase) return state
  return { phase, generation: state.generation + 1 }
}

export function mapChatStatusToConnectionPhase(
  status: 'idle' | 'connecting' | 'open' | 'closed' | 'error',
): RoomMediaConnectionPhase {
  switch (status) {
    case 'open':
      return 'wsReady'
    case 'connecting':
      return 'wsConnecting'
    case 'error':
      return 'degraded'
    case 'closed':
      return 'reconnecting'
    case 'idle':
    default:
      return 'idle'
  }
}

export function mapSfuStatusToConnectionPhase(
  status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting' | 'degraded',
): RoomMediaConnectionPhase {
  switch (status) {
    case 'open':
      return 'ready'
    case 'connecting':
      return 'sfuConnecting'
    case 'reconnecting':
      return 'reconnecting'
    case 'degraded':
    case 'error':
      return 'degraded'
    case 'closed':
      return 'reconnecting'
    case 'idle':
    default:
      return 'idle'
  }
}

export function mergeConnectionPhases(
  chatPhase: RoomMediaConnectionPhase,
  sfuPhase: RoomMediaConnectionPhase,
): RoomMediaConnectionPhase {
  if (chatPhase === 'tornDown' || sfuPhase === 'tornDown') return 'tornDown'
  if (chatPhase === 'degraded' || sfuPhase === 'degraded') return 'degraded'
  if (chatPhase === 'reconnecting' || sfuPhase === 'reconnecting') return 'reconnecting'
  if (sfuPhase === 'ready') return 'ready'
  if (sfuPhase === 'sfuConnecting' || sfuPhase === 'tokenMint') return sfuPhase
  if (chatPhase === 'wsReady') return sfuPhase === 'idle' ? 'wsReady' : sfuPhase
  return chatPhase
}
