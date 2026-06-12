/**
 * Harness step 5: chat WS reconnect with live SFU signaling.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomRealtimeSdk } from '@web/room/sessions/RoomRealtimeSdk'
import {
  assertDrawerReconnectCycle,
  assertSiblingDrawerStaysConnected,
} from '@web/room/sessions/roomRealtimeSdkTestHelpers'
import {
  harnessJoinOptions,
  installSfuWebSocketTracker,
  mockHarnessSfuTokenFetch,
} from '../lib/harness-sdk-test-setup.js'
import { startRoomWsStub, type RoomWsStubHandle } from '../lib/room-ws-stub.js'

describe('harness step 5: chat WS reconnect', () => {
  let stub: RoomWsStubHandle | undefined

  beforeEach(async () => {
    vi.clearAllMocks()
    mockHarnessSfuTokenFetch()
    installSfuWebSocketTracker()
    stub = await startRoomWsStub()
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (stub) await stub.close()
  })

  it('chat reconnects while sfuSignaling stays connected', async () => {
    vi.useFakeTimers()

    const sdk = new RoomRealtimeSdk()
    sdk.join('room-abc', harnessJoinOptions(stub!.url, 'sess-harness-chat-reconnect'))

    await vi.waitFor(
      () => {
        const diag = sdk.getDiagnostics()
        expect(diag.drawers.chat.state).toBe('connected')
        expect(diag.drawers.sfuSignaling.state).toBe('connected')
      },
      { timeout: 60_000 },
    )

    stub!.forceCloseLatest()

    await vi.waitFor(() => {
      expect(sdk.getDiagnostics().drawers.chat.state).toBe('reconnecting')
    })

    const duringOutage = sdk.getDiagnostics()
    assertSiblingDrawerStaysConnected(duringOutage, 'sfuSignaling')

    await vi.advanceTimersByTimeAsync(1_100)
    await vi.waitFor(
      () => {
        expect(sdk.getDiagnostics().drawers.chat.state).toBe('connected')
      },
      { timeout: 60_000 },
    )

    const afterRecovery = sdk.getDiagnostics()
    assertDrawerReconnectCycle(duringOutage, afterRecovery, 'chat')
    assertSiblingDrawerStaysConnected(afterRecovery, 'sfuSignaling')

    sdk.leave()
  })
})
