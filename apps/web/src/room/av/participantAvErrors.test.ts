import { describe, expect, it } from 'vitest'
import {
  isParticipantAvTokenHardFail,
  participantAvErrorFromDomException,
  participantAvErrorFromSfuMediaCode,
  participantAvErrorFromSfuSessionEnd,
  participantAvErrorFromSfuTokenDenial,
  participantAvErrorMessage,
  parseSfuTokenHttpErrorPayload,
} from './participantAvErrors'

describe('participantAvErrorMessage', () => {
  it('returns contract copy for every taxonomy code', () => {
    expect(participantAvErrorMessage('permission_denied')).toContain('permission was blocked')
    expect(participantAvErrorMessage('publisher_cap_exceeded')).toContain('maximum number of live')
    expect(participantAvErrorMessage('token_expired')).toContain('connection expired')
    expect(participantAvErrorMessage('sfu_signaling_failed')).toContain('Video relay connection lost')
  })
})

describe('participantAvErrorFromDomException', () => {
  it('maps NotAllowedError to permission_denied', () => {
    expect(
      participantAvErrorFromDomException(new DOMException('denied', 'NotAllowedError')),
    ).toBe('permission_denied')
  })

  it('maps NotFoundError to device_unavailable', () => {
    expect(
      participantAvErrorFromDomException(new DOMException('missing', 'NotFoundError')),
    ).toBe('device_unavailable')
  })

  it('maps NotReadableError and OverconstrainedError to device_unavailable', () => {
    expect(
      participantAvErrorFromDomException(new DOMException('busy', 'NotReadableError')),
    ).toBe('device_unavailable')
    expect(
      participantAvErrorFromDomException(new DOMException('bad', 'OverconstrainedError')),
    ).toBe('device_unavailable')
  })
})

describe('participantAvErrorFromSfuTokenDenial', () => {
  it('maps API denial codes to participant taxonomy', () => {
    expect(participantAvErrorFromSfuTokenDenial(403, 'publisher_cap_exceeded')).toBe(
      'publisher_cap_exceeded',
    )
    expect(participantAvErrorFromSfuTokenDenial(403, 'av_disabled')).toBe('av_disabled')
    expect(participantAvErrorFromSfuTokenDenial(403, 'fan_auth_required')).toBe('fan_auth_required')
    expect(participantAvErrorFromSfuTokenDenial(429, 'rate_limited')).toBe('rate_limited')
    expect(participantAvErrorFromSfuTokenDenial(429, undefined)).toBe('rate_limited')
  })

  it('returns null for unmapped token codes', () => {
    expect(participantAvErrorFromSfuTokenDenial(403, 'unknown_session')).toBeNull()
  })
})

describe('isParticipantAvTokenHardFail', () => {
  it('flags capacity and auth denials as hard-fail', () => {
    expect(isParticipantAvTokenHardFail('publisher_cap_exceeded')).toBe(true)
    expect(isParticipantAvTokenHardFail('av_disabled')).toBe(true)
    expect(isParticipantAvTokenHardFail('unknown_session')).toBe(false)
  })
})

describe('participantAvErrorFromSfuMediaCode', () => {
  it('maps signaling failures to sfu_signaling_failed', () => {
    expect(participantAvErrorFromSfuMediaCode('signaling_failed')).toBe('sfu_signaling_failed')
    expect(participantAvErrorFromSfuMediaCode('signaling_closed')).toBe('sfu_signaling_failed')
  })

  it('maps produce failures to sfu_publish_rejected', () => {
    expect(participantAvErrorFromSfuMediaCode('produce_failed')).toBe('sfu_publish_rejected')
  })
})

describe('participantAvErrorFromSfuSessionEnd', () => {
  it('returns sfu_signaling_failed after reconnect exhaustion with publish intent', () => {
    expect(
      participantAvErrorFromSfuSessionEnd('signaling_close', {
        hadPublishIntent: true,
        reconnectAttempts: 5,
      }),
    ).toBe('sfu_signaling_failed')
  })

  it('returns null while reconnect attempts remain', () => {
    expect(
      participantAvErrorFromSfuSessionEnd('signaling_close', {
        hadPublishIntent: true,
        reconnectAttempts: 2,
      }),
    ).toBeNull()
  })
})

describe('parseSfuTokenHttpErrorPayload', () => {
  it('parses code and error from JSON body', () => {
    expect(
      parseSfuTokenHttpErrorPayload(
        JSON.stringify({
          code: 'publisher_cap_exceeded',
          error: 'This room has reached the maximum number of live cameras and microphones.',
        }),
      ),
    ).toEqual({
      code: 'publisher_cap_exceeded',
      error: 'This room has reached the maximum number of live cameras and microphones.',
      detail: undefined,
    })
  })
})
