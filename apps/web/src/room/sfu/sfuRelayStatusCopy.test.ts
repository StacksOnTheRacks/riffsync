import { describe, expect, it } from 'vitest'
import { LOCAL_SFU_UNREACHABLE_MSG } from './sfuConfigErrors'
import {
  resolveGuestVideoRelayStatusLine,
  resolveHostVideoRelayStatusLine,
} from './sfuRelayStatusCopy'

describe('resolveGuestVideoRelayStatusLine', () => {
  it('prefers configuration-class SFU errors over connecting copy', () => {
    expect(
      resolveGuestVideoRelayStatusLine({
        sfuRelayError: LOCAL_SFU_UNREACHABLE_MSG,
        guestShareFsm: 'verifying_media',
      }),
    ).toBe(LOCAL_SFU_UNREACHABLE_MSG)
  })

  it('does not branch on chat WS state (drawer-independent banners)', () => {
    expect(
      resolveGuestVideoRelayStatusLine({
        sfuRelayError: null,
        guestShareFsm: 'running',
      }),
    ).toBeNull()
  })

  it('shows host-screen FSM copy when relay is healthy', () => {
    expect(
      resolveGuestVideoRelayStatusLine({
        sfuRelayError: null,
        guestShareFsm: 'idle',
      }),
    ).toBe('Waiting for host to share…')
  })
})

describe('resolveHostVideoRelayStatusLine', () => {
  it('surfaces configuration-class SFU errors on the host relay status', () => {
    expect(resolveHostVideoRelayStatusLine(LOCAL_SFU_UNREACHABLE_MSG)).toBe(
      LOCAL_SFU_UNREACHABLE_MSG,
    )
    expect(resolveHostVideoRelayStatusLine(null)).toBeNull()
  })
})
