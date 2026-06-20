import type { GuestHostScreenFsm } from '../sfu/sfuRelayStatusCopy'
import type { SfuHealthDiagnostics } from './SfuMediaSession'

export const DRAWER_LIFECYCLE_STATES = [
  'connected',
  'reconnecting',
  'degraded',
  'torn-down',
] as const

export type DrawerLifecycleState = (typeof DRAWER_LIFECYCLE_STATES)[number]

export type ChatDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
}

export type SfuSignalingDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
  role?: 'producer' | 'consumer'
  health: SfuHealthDiagnostics
}

export type TheaterPlaybackDrawerDiagnostics = {
  state: DrawerLifecycleState
  lastErrorCode?: string
  audioContextState?: AudioContextState
  guestShareFsm?: GuestHostScreenFsm
}

export type RoomRealtimeDiagnostics = {
  roomId: string
  sessionId: string
  asOf: string
  drawers: {
    chat: ChatDrawerDiagnostics
    sfuSignaling: SfuSignalingDrawerDiagnostics
    theaterPlayback: TheaterPlaybackDrawerDiagnostics
  }
  activeErrorCodes: string[]
}

export const REQUIRED_DIAGNOSTIC_KEYS = [
  'roomId',
  'sessionId',
  'asOf',
  'drawers',
  'activeErrorCodes',
] as const satisfies readonly (keyof RoomRealtimeDiagnostics)[]

export const REQUIRED_DRAWER_KEYS = [
  'chat',
  'sfuSignaling',
  'theaterPlayback',
] as const satisfies readonly (keyof RoomRealtimeDiagnostics['drawers'])[]

export const REQUIRED_SFU_HEALTH_KEYS = [
  'connectivity',
  'produceConsume',
] as const satisfies readonly (keyof SfuHealthDiagnostics)[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object`)
  }
}

function assertRequiredKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void {
  for (const key of keys) {
    if (!(key in value)) {
      throw new TypeError(`${path}.${key} is required`)
    }
  }
}

function assertDrawerLifecycleState(value: unknown, path: string): void {
  if (!DRAWER_LIFECYCLE_STATES.includes(value as DrawerLifecycleState)) {
    throw new TypeError(`${path} must be a known drawer lifecycle state`)
  }
}

function assertDrawer(value: unknown, path: string): void {
  assertRecord(value, path)
  assertDrawerLifecycleState(value.state, `${path}.state`)
}

export function assertRoomRealtimeDiagnosticsContract(
  diag: unknown,
): asserts diag is RoomRealtimeDiagnostics {
  assertRecord(diag, 'diagnostics')
  assertRequiredKeys(diag, REQUIRED_DIAGNOSTIC_KEYS, 'diagnostics')

  if (typeof diag.roomId !== 'string') throw new TypeError('diagnostics.roomId must be a string')
  if (typeof diag.sessionId !== 'string') {
    throw new TypeError('diagnostics.sessionId must be a string')
  }
  if (typeof diag.asOf !== 'string') throw new TypeError('diagnostics.asOf must be a string')
  if (!Array.isArray(diag.activeErrorCodes)) {
    throw new TypeError('diagnostics.activeErrorCodes must be an array')
  }

  assertRecord(diag.drawers, 'diagnostics.drawers')
  assertRequiredKeys(diag.drawers, REQUIRED_DRAWER_KEYS, 'diagnostics.drawers')

  for (const drawerKey of REQUIRED_DRAWER_KEYS) {
    assertDrawer(diag.drawers[drawerKey], `diagnostics.drawers.${drawerKey}`)
  }

  const sfuSignaling = diag.drawers.sfuSignaling
  assertRecord(sfuSignaling, 'diagnostics.drawers.sfuSignaling')
  assertRecord(sfuSignaling.health, 'diagnostics.drawers.sfuSignaling.health')
  assertRequiredKeys(
    sfuSignaling.health,
    REQUIRED_SFU_HEALTH_KEYS,
    'diagnostics.drawers.sfuSignaling.health',
  )

  for (const healthKey of REQUIRED_SFU_HEALTH_KEYS) {
    const health = sfuSignaling.health[healthKey]
    assertRecord(health, `diagnostics.drawers.sfuSignaling.health.${healthKey}`)
    assertDrawerLifecycleState(
      health.state,
      `diagnostics.drawers.sfuSignaling.health.${healthKey}.state`,
    )
  }
}
