import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginCastAttempt,
  reportCastDiag,
  resetCastAttemptForTests,
  sanitizeCastDiagReport,
} from './castDiag'

vi.mock('../../config/apiBaseUrl', () => ({
  getPublicApiBaseUrl: () => 'https://api.test.example',
}))

describe('castDiag', () => {
  afterEach(() => {
    resetCastAttemptForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps allowlisted fields and drops room or device identifiers', () => {
    const attemptId = '11111111-1111-4111-8111-111111111111'
    const sanitized = sanitizeCastDiagReport({
      event: 'sender_request_session_rejected',
      hop: 'sender',
      attemptId,
      code: 'session_error',
      description: 'LAUNCH_ERROR',
      details: { type: 'LOAD_CANCELLED', device: 'Living Room' },
    })
    expect(sanitized).toEqual({
      event: 'sender_request_session_rejected',
      hop: 'sender',
      attemptId,
      code: 'session_error',
      description: 'LAUNCH_ERROR',
      details: 'LOAD_CANCELLED',
    })
  })

  it('logs a single JSON line without throwing when ingest is disabled in tests', () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    reportCastDiag({
      event: 'sender_request_session_rejected',
      hop: 'sender',
      attemptId: '11111111-1111-4111-8111-111111111111',
      code: 'session_error',
    })

    expect(consoleError).toHaveBeenCalledTimes(1)
    const line = String(consoleError.mock.calls[0]?.[0])
    expect(line.startsWith('[RiffSync Cast] {')).toBe(true)
    expect(line).toContain('"event":"sender_request_session_rejected"')
    expect(line).toContain('"code":"session_error"')
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('reuses the current attempt id when the report omits one', () => {
    const attemptId = beginCastAttempt()
    expect(sanitizeCastDiagReport({ event: 'sender_start_requested', hop: 'sender' }).attemptId).toBe(
      attemptId,
    )
  })
})
