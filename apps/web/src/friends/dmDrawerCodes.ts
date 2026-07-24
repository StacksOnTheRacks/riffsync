export const DM_DRAWER_ERROR_CODES = ['DM_SEND_DROPPED', 'DM_PUSH_UNAVAILABLE'] as const

export type DmDrawerErrorCode = (typeof DM_DRAWER_ERROR_CODES)[number]

export type DmDrawerError = {
  code: DmDrawerErrorCode
  cause?: unknown
}

export function dmSendDroppedError(cause?: unknown): DmDrawerError {
  return { code: 'DM_SEND_DROPPED', cause }
}

export function dmPushUnavailableError(cause?: unknown): DmDrawerError {
  return { code: 'DM_PUSH_UNAVAILABLE', cause }
}

export function isDmDrawerErrorCode(value: string): value is DmDrawerErrorCode {
  return (DM_DRAWER_ERROR_CODES as readonly string[]).includes(value)
}
