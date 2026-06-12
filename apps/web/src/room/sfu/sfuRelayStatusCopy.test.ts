import { describe, expect, it } from 'vitest'
import { LOCAL_SFU_UNREACHABLE_MSG } from './sfuConfigErrors'
import {
  resolveGuestVideoRelayStatusLine,
  resolveHostVideoRelayStatusLine,
  type GuestHostScreenFsm,
} from './sfuRelayStatusCopy'

/** Retired anti-pattern from presentation.md (#147 / #201). */
const RETIRED_COMBINED_CHAT_VIDEO_COPY = 'Reconnecting chat… Video may pause briefly.'

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

  it('never returns chat reconnect copy or the retired combined string (#201)', () => {
    const guestFsmStates: GuestHostScreenFsm[] = ['idle', 'verifying_media', 'running']
    const sfuErrors: Array<string | null> = [null, LOCAL_SFU_UNREACHABLE_MSG]

    for (const guestShareFsm of guestFsmStates) {
      for (const sfuRelayError of sfuErrors) {
        const line = resolveGuestVideoRelayStatusLine({ sfuRelayError, guestShareFsm })
        expect(line).not.toBe('Reconnecting chat…')
        expect(line).not.toBe(RETIRED_COMBINED_CHAT_VIDEO_COPY)
      }
    }
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
