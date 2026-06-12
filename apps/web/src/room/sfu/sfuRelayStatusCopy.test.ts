import fs from 'node:fs'
import path from 'node:path'
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

  it('maps verifying_media to Connecting to video relay… (#212)', () => {
    expect(
      resolveGuestVideoRelayStatusLine({
        sfuRelayError: null,
        guestShareFsm: 'verifying_media',
      }),
    ).toBe('Connecting to video relay…')
  })

  it('returns null for running FSM when relay is healthy (#212)', () => {
    expect(
      resolveGuestVideoRelayStatusLine({
        sfuRelayError: null,
        guestShareFsm: 'running',
      }),
    ).toBeNull()
  })

  it('accepts only sfuRelayError and guestShareFsm (no chat WS input) (#201 / #212)', () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, 'sfuRelayStatusCopy.ts'), 'utf8')
    expect(src).not.toContain('chatWsDisconnected')
    expect(src).toMatch(/resolveGuestVideoRelayStatusLine\(opts: \{\s*sfuRelayError/)
    expect(src).toMatch(/guestShareFsm: GuestHostScreenFsm\s*\}/)
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
