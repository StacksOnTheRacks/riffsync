import { describe, expect, it } from 'vitest'
import {
  REALTIME_DRAWER_ERROR_CODES,
  SIGNALING_TIMEOUT_MS,
  ICE_DISCONNECTED_FAILURE_MS,
  chatSendDroppedError,
  collectActiveErrorCodes,
  drawerForErrorCode,
  isActiveErrorCode,
  mapIceConnectionStateToDrawerError,
  mapSfuConfigMediaCodeToDrawerError,
  mapSfuMediaCodeToDrawerError,
  mapTurnRelayRequiredFailure,
  playbackAudioBlockedError,
  producerClosedError,
  theaterAudioSuspendedError,
} from './realtimeDrawerErrors'

describe('realtimeDrawerErrors', () => {
  it('lists every code from the execution_model boundary table', () => {
    const executionModelCodes = [
      'CHAT_SEND_DROPPED',
      'SIGNALING_TIMEOUT',
      'ICE_FAILED',
      'TURN_RELAY_REQUIRED',
      'PRODUCER_CLOSED',
      'SFU_TOKEN_DENIED',
      'TRANSPORT_LIMIT_REACHED',
      'CONSUMER_LIMIT_REACHED',
      'THEATER_AUDIO_SUSPENDED',
      'SFU_RELAY_URL_MISSING',
      'LOCAL_SFU_UNREACHABLE',
      'SFU_RELAY_UNREACHABLE',
    ]
    for (const code of executionModelCodes) {
      expect(REALTIME_DRAWER_ERROR_CODES).toContain(code)
    }
  })

  it('lists surface-mapping codes from error_state.md', () => {
    expect(REALTIME_DRAWER_ERROR_CODES).toContain('PLAYBACK_AUDIO_BLOCKED')
    expect(REALTIME_DRAWER_ERROR_CODES).toContain('sfu_signaling_failed')
    expect(REALTIME_DRAWER_ERROR_CODES).toContain('sfu_publish_rejected')
    expect(REALTIME_DRAWER_ERROR_CODES).toContain('CHAT_RECONNECTING')
  })

  it('exposes normative timing constants', () => {
    expect(SIGNALING_TIMEOUT_MS).toBe(15_000)
    expect(ICE_DISCONNECTED_FAILURE_MS).toBe(10_000)
  })

  it('maps chat send drops to the chat drawer', () => {
    const err = chatSendDroppedError({ readyState: 3 })
    expect(err).toEqual({
      code: 'CHAT_SEND_DROPPED',
      drawer: 'chat',
      cause: { readyState: 3 },
    })
    expect(drawerForErrorCode(err.code)).toBe('chat')
  })

  it('maps SFU config-class media codes to drawer errors', () => {
    expect(mapSfuConfigMediaCodeToDrawerError('missing_ws_url')).toEqual({
      code: 'SFU_RELAY_URL_MISSING',
      drawer: 'sfuSignaling',
    })
    expect(mapSfuConfigMediaCodeToDrawerError('local_sfu_unreachable')).toEqual({
      code: 'LOCAL_SFU_UNREACHABLE',
      drawer: 'sfuSignaling',
    })
    expect(mapSfuConfigMediaCodeToDrawerError('sfu_relay_unreachable')).toEqual({
      code: 'SFU_RELAY_UNREACHABLE',
      drawer: 'sfuSignaling',
    })
  })

  it('maps SFU media codes to signaling and connectivity drawer errors', () => {
    expect(mapSfuMediaCodeToDrawerError('signaling_failed')).toEqual({
      code: 'SIGNALING_TIMEOUT',
      drawer: 'sfuSignaling',
    })
    expect(mapSfuMediaCodeToDrawerError('signaling_closed')).toEqual({
      code: 'sfu_signaling_failed',
      drawer: 'sfuSignaling',
    })
    expect(mapSfuMediaCodeToDrawerError('transport_failed')).toEqual({
      code: 'ICE_FAILED',
      drawer: 'connectivity',
    })
    expect(mapSfuMediaCodeToDrawerError('transport_stalled')).toEqual({
      code: 'ICE_FAILED',
      drawer: 'connectivity',
    })
    expect(mapSfuMediaCodeToDrawerError('consume_failed')).toEqual({
      code: 'CONSUMER_LIMIT_REACHED',
      drawer: 'sfuSignaling',
    })
    expect(mapSfuMediaCodeToDrawerError('produce_failed')).toEqual({
      code: 'sfu_publish_rejected',
      drawer: 'sfuSignaling',
    })
  })

  it('maps ICE failed state immediately', () => {
    expect(mapIceConnectionStateToDrawerError('failed')).toEqual({
      code: 'ICE_FAILED',
      drawer: 'connectivity',
    })
    expect(mapIceConnectionStateToDrawerError('disconnected')).toBeNull()
    expect(mapIceConnectionStateToDrawerError('connected')).toBeNull()
  })

  it('maps theater playback boundary errors', () => {
    expect(theaterAudioSuspendedError()).toEqual({
      code: 'THEATER_AUDIO_SUSPENDED',
      drawer: 'theaterPlayback',
    })
    expect(playbackAudioBlockedError()).toEqual({
      code: 'PLAYBACK_AUDIO_BLOCKED',
      drawer: 'theaterPlayback',
    })
  })

  it('maps TURN relay requirement to connectivity drawer', () => {
    expect(mapTurnRelayRequiredFailure('no relay')).toEqual({
      code: 'TURN_RELAY_REQUIRED',
      drawer: 'connectivity',
      cause: 'no relay',
    })
  })

  it('excludes PRODUCER_CLOSED and CHAT_RECONNECTING from activeErrorCodes', () => {
    expect(isActiveErrorCode('PRODUCER_CLOSED')).toBe(false)
    expect(isActiveErrorCode('CHAT_RECONNECTING')).toBe(false)
    expect(isActiveErrorCode('CHAT_SEND_DROPPED')).toBe(true)
    expect(isActiveErrorCode('ICE_FAILED')).toBe(true)

    expect(
      collectActiveErrorCodes([
        'CHAT_SEND_DROPPED',
        'PRODUCER_CLOSED',
        'CHAT_RECONNECTING',
        'ICE_FAILED',
        'PRODUCER_CLOSED',
      ]),
    ).toEqual(['CHAT_SEND_DROPPED', 'ICE_FAILED'])
  })

  it('dedupes active codes and ignores unknown or inactive drawer codes', () => {
    expect(
      collectActiveErrorCodes([
        undefined,
        'not-a-real-code',
        'CHAT_RECONNECTING',
        'CHAT_SEND_DROPPED',
        'SIGNALING_TIMEOUT',
        'CHAT_SEND_DROPPED',
        'THEATER_AUDIO_SUSPENDED',
      ]),
    ).toEqual(['CHAT_SEND_DROPPED', 'SIGNALING_TIMEOUT', 'THEATER_AUDIO_SUSPENDED'])
  })

  it('scopes drawer membership for collected active codes', () => {
    const codes = collectActiveErrorCodes([
      'CHAT_SEND_DROPPED',
      'SIGNALING_TIMEOUT',
      'THEATER_AUDIO_SUSPENDED',
    ])
    for (const code of codes) {
      expect(drawerForErrorCode(code as (typeof codes)[number])).toBeTruthy()
    }
    expect(drawerForErrorCode('CHAT_SEND_DROPPED')).toBe('chat')
    expect(drawerForErrorCode('SIGNALING_TIMEOUT')).toBe('sfuSignaling')
    expect(drawerForErrorCode('THEATER_AUDIO_SUSPENDED')).toBe('theaterPlayback')
  })

  it('treats producerClosedError as informational at diagnostics boundary', () => {
    const err = producerClosedError('producer-1')
    expect(err.code).toBe('PRODUCER_CLOSED')
    expect(collectActiveErrorCodes([err.code])).toEqual([])
  })
})
