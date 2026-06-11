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
        chatWsDisconnected: false,
      }),
    ).toBe(LOCAL_SFU_UNREACHABLE_MSG)
  })

  it('shows chat reconnect copy only when no SFU config error is active', () => {
    expect(
      resolveGuestVideoRelayStatusLine({
        sfuRelayError: null,
        guestShareFsm: 'running',
        chatWsDisconnected: true,
      }),
    ).toBe('Reconnecting chat… Video may pause briefly.')
  })

  it('shows host-screen FSM copy when relay is healthy', () => {
    expect(
      resolveGuestVideoRelayStatusLine({
        sfuRelayError: null,
        guestShareFsm: 'idle',
        chatWsDisconnected: false,
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
